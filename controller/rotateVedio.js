// controller/rotateVideoController.js
const ffmpeg = require('fluent-ffmpeg');
const cloudinary = require('../lib/cloudinaryConfig');
const fs = require('fs');

exports.rotateVideo = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const { rotation } = req.body; // rotation can be: 90, 180, 270, flipH, flipV
    const inputBuffer = req.file.buffer;
    const tempInputPath = `./temp_input_${Date.now()}.mp4`;
    const tempOutputPath = `./temp_output_${Date.now()}.mp4`;

    // Write buffer to temporary file
    await fs.promises.writeFile(tempInputPath, inputBuffer);

    // Define filter based on rotation type
    let filter;
    switch (rotation) {
      case '90':
        filter = 'transpose=1'; // rotate 90 degrees clockwise
        break;
      case '180':
        filter = 'transpose=2,transpose=2'; // rotate 180 degrees
        break;
      case '270':
        filter = 'transpose=2'; // rotate 90 degrees counterclockwise
        break;
      case 'flipH':
        filter = 'hflip'; // horizontal flip
        break;
      case 'flipV':
        filter = 'vflip'; // vertical flip
        break;
      default:
        filter = 'transpose=1'; // default to 90 degrees clockwise
    }

    await new Promise((resolve, reject) => {
      ffmpeg(tempInputPath)
        .videoFilters(filter)
        .outputOptions('-c:a copy') // copy audio stream without re-encoding
        .on('end', resolve)
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
          folder: 'video_rotations',
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
    });

    // Clean up temporary files
    await fs.promises.unlink(tempInputPath);
    await fs.promises.unlink(tempOutputPath);

    res.status(200).json({
      message: 'Video rotation successful!',
      url: uploadResult.secure_url,
      rotation: rotation
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error processing video rotation', details: error.message });

    // Cleanup in case of error
    try {
      if (fs.existsSync(tempInputPath)) await fs.promises.unlink(tempInputPath);
      if (fs.existsSync(tempOutputPath)) await fs.promises.unlink(tempOutputPath);
    } catch (cleanupError) {
      console.error('Error cleaning up temporary files:', cleanupError);
    }
  }
};