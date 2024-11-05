const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const cloudinary = require('../lib/cloudinaryConfig');
const { v4: uuidv4 } = require('uuid');

const createRequiredDirectories = () => {
  const uploadDir = path.join(__dirname, '../uploads');
  const tempDir = path.join(uploadDir, 'temp');
  
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
  }
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }
};

exports.videoLooping = async (req, res) => {
  try {
    createRequiredDirectories();

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No video file uploaded'
      });
    }

    const videoPath = path.join(__dirname, '../uploads/temp', `input-${uuidv4()}.mp4`);
    const outputPath = path.join(__dirname, '../uploads/temp', `output-${uuidv4()}.mp4`);

    fs.writeFileSync(videoPath, req.file.buffer);

    const loopCount = parseInt(req.body.loopCount) || 3;

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .inputOptions([`-stream_loop ${loopCount}`])
        .output(outputPath)
        .on('start', () => {
          console.log('Started processing video...');
        })
        .on('progress', (progress) => {
          console.log(`Processing: ${progress.percent}% done`);
        })
        .on('end', () => {
          console.log('Finished processing video');
          resolve();
        })
        .on('error', (err) => {
          console.error('Error during processing:', err);
          reject(err);
        })
        .run();
    });

    const result = await cloudinary.uploader.upload(outputPath, {
      resource_type: 'video',
      folder: 'video-loops'
    });

    try {
      fs.unlinkSync(videoPath);
      fs.unlinkSync(outputPath);
    } catch (cleanupError) {
      console.error('Error cleaning up temporary files:', cleanupError);
    }

    return res.status(200).json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id
    });

  } catch (error) {
    console.error('Error creating video loop:', error);
    
    try {
      const tempDir = path.join(__dirname, '../uploads/temp');
      const files = fs.readdirSync(tempDir);
      files.forEach(file => {
        const filePath = path.join(tempDir, file);
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
        }
      });
    } catch (cleanupError) {
      console.error('Error cleaning up after failure:', cleanupError);
    }

    return res.status(500).json({
      success: false,
      message: 'Error processing video',
      error: error.message
    });
  }
};