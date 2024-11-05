const ffmpeg = require('fluent-ffmpeg');
const cloudinary = require('../lib/cloudinaryConfig');
const fs = require('fs');
const path = require('path');

const speedController = async (req, res) => {
  const { speed } = req.body;
  const tempFilePath = path.join(__dirname, '../uploads', `${Date.now()}_${req.file.originalname}`);

  try {
    fs.writeFileSync(tempFilePath, req.file.buffer);

    const outputFilePath = path.join(__dirname, '../uploads', `output_${Date.now()}.mp4`);
    await new Promise((resolve, reject) => {
      ffmpeg(tempFilePath)
        .videoFilters(`setpts=${1 / speed}*PTS`)
        .output(outputFilePath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    const result = await cloudinary.uploader.upload(outputFilePath, { resource_type: 'video' });

    fs.unlinkSync(tempFilePath);
    fs.unlinkSync(outputFilePath);

    res.json({ videoUrl: result.secure_url });
  } catch (error) {
    console.error('Error processing video:', error);
    res.status(500).json({ error: 'Error processing video' });
  }
};

module.exports = { speedController };
