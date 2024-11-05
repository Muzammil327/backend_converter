const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const cloudinary = require('../lib/cloudinaryConfig');

ffmpeg.setFfmpegPath(ffmpegPath);

exports.convertedVideo = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const { codec } = req.body;
    const inputBuffer = req.file.buffer;
    const tempInputPath = `./temp_input_${Date.now()}.mp4`;
    const tempOutputPath = `./temp_output_${Date.now()}.webm`;

    await fs.promises.writeFile(tempInputPath, inputBuffer);
    const videoCodec = codec === 'vp8' ? 'libvpx' : 'libvpx-vp9';
    const resolution = codec === 'vp8' ? '1280x720' : '1920x1080';
    const videoBitrate = codec === 'vp8' ? '2000k' : '3000k';

    console.log(`FFmpeg starting conversion with codec: ${videoCodec} and resolution: ${resolution}`);

    await new Promise((resolve, reject) => {
      ffmpeg(tempInputPath)
        .videoCodec(videoCodec)
        .size(resolution)
        .videoBitrate(videoBitrate)
        .outputOptions(['-r 30'])
        .on('end', resolve)
        .on('error', reject)
        .save(tempOutputPath);
    });
    console.log('Uploading converted file to Cloudinary...');
    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload(tempOutputPath,
        { resource_type: 'video', folder: 'videos_encoding_decoding' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
    });

    await fs.promises.unlink(tempInputPath);
    await fs.promises.unlink(tempOutputPath);

    res.status(200).json({
      message: 'VP8/VP9 Conversion successful!',
      url: uploadResult.secure_url,
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error processing VP8 video', details: error.message });
  }
};
