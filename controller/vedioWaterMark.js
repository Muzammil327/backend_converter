const ffmpeg = require('fluent-ffmpeg');
const cloudinary = require('../lib/cloudinaryConfig');
const fs = require('fs');

exports.addWatermark = async (req, res) => {
  if (!req.files || !req.files.video || !req.files.watermark) {
    return res.status(400).json({ error: 'Both video and watermark files are required' });
  }

  const tempVideoPath = `./temp_video_${Date.now()}.mp4`;
  const tempWatermarkPath = `./temp_watermark_${Date.now()}.png`;
  const tempOutputPath = `./temp_output_${Date.now()}.mp4`;

  try {
    // Write files to temporary storage
    await fs.promises.writeFile(tempVideoPath, req.files.video[0].buffer);
    await fs.promises.writeFile(tempWatermarkPath, req.files.watermark[0].buffer);

    const position = req.body.position || 'bottomright';

    // Get overlay position coordinates
    const overlayPosition = getOverlayPosition(position);

    // Process video with FFmpeg
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(tempVideoPath)
        .input(tempWatermarkPath)
        .complexFilter([
          {
            filter: 'overlay',
            options: overlayPosition,
          }
        ])
        .outputOptions('-c:a copy')
        .on('start', (commandLine) => {
          console.log('FFmpeg started:', commandLine);
        })
        .on('end', () => {
          console.log('FFmpeg finished');
          resolve();
        })
        .on('error', (err) => {
          console.error('FFmpeg error:', err);
          reject(err);
        })
        .save(tempOutputPath);
    });

    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload(tempOutputPath,
        {
          resource_type: 'video',
          folder: 'watermarked_videos',
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
    });

    // Clean up temporary files
    await Promise.all([
      fs.promises.unlink(tempVideoPath),
      fs.promises.unlink(tempWatermarkPath),
      fs.promises.unlink(tempOutputPath)
    ]);

    res.status(200).json({
      message: 'Watermark added successfully!',
      url: uploadResult.secure_url
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error processing video watermark', details: error.message });

    // Cleanup in case of error
    try {
      if (fs.existsSync(tempVideoPath)) await fs.promises.unlink(tempVideoPath);
      if (fs.existsSync(tempWatermarkPath)) await fs.promises.unlink(tempWatermarkPath);
      if (fs.existsSync(tempOutputPath)) await fs.promises.unlink(tempOutputPath);
    } catch (cleanupError) {
      console.error('Error cleaning up temporary files:', cleanupError);
    }
  }
};

// Helper function to get overlay position
function getOverlayPosition(position) {
  const padding = 10;
  switch (position) {
    case 'topleft':
      return `x=${padding}:y=${padding}`;
    case 'topright':
      return `x=W-w-${padding}:y=${padding}`;
    case 'bottomleft':
      return `x=${padding}:y=H-h-${padding}`;
    case 'center':
      return 'x=(W-w)/2:y=(H-h)/2';
    case 'bottomright':
    default:
      return `x=W-w-${padding}:y=H-h-${padding}`;
  }
}