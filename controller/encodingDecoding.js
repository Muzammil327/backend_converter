const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const cloudinary = require('../lib/cloudinaryConfig');

ffmpeg.setFfmpegPath(ffmpegPath);

exports.convertVideo = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const { codec } = req.body;
    const inputBuffer = req.file.buffer;
    const tempInputPath = `./temp_input_${Date.now()}.mp4`;
    const tempOutputPath = `./temp_output_${Date.now()}.mp4`;

    await fs.promises.writeFile(tempInputPath, inputBuffer);
    const selectedCodec = codec === 'h265' ? 'libx265' : 'libx264';
    const resolution = codec === 'h265' ? '1920x1080' : '1280x720';

    await new Promise((resolve, reject) => {
      ffmpeg(tempInputPath)
        .videoCodec(selectedCodec)
        .size(resolution)
        .on('end', resolve)
        .on('error', reject)
        .save(tempOutputPath);
    });

    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload(tempOutputPath,
        {
          resource_type: 'video',
          folder: 'videos_encoding_decoding',
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
    });

    await fs.promises.unlink(tempInputPath);
    await fs.promises.unlink(tempOutputPath);

    res.status(200).json({
      message: 'Conversion successful!',
      url: uploadResult.secure_url
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      error: 'Error processing video',
      details: error.message
    });
  }
};
