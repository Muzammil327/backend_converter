// const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const cloudinary = require('../lib/cloudinaryConfig');
const path = require('path');

const adjustAspectRatio = async (req, res) => {
  try {
    const { file } = req;
    const { ratio } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const uploadDir = path.join(__dirname, '../uploads/aspect');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const tempPath = path.join(uploadDir, `temp_${Date.now()}_${file.originalname}`);
    fs.writeFileSync(tempPath, file.buffer);

    let width, height;
    switch (ratio) {
      case '16:9':
        width = 1920;
        height = 1080;
        break;
      case '4:3':
        width = 1440;
        height = 1080;
        break;
      case '1:1':
        width = 1080;
        height = 1080;
        break;
      case '9:16':
        width = 1080;
        height = 1920;
        break;
      default:
        const [w, h] = ratio.split(':').map(Number);
        width = w * 120;   
        height = h * 120;
    }

    const result = await cloudinary.uploader.upload(tempPath, {
      resource_type: 'video',
      transformation: [
        {
          width: width,
          height: height,
          crop: 'fill',
          gravity: 'center'
        }
      ]
    });

    fs.unlinkSync(tempPath);

    res.json({
      success: true,
      message: 'Aspect ratio adjusted successfully',
      video: {
        url: result.secure_url,
        public_id: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format
      }
    });

  } catch (error) {
    console.error('Error adjusting aspect ratio:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to adjust aspect ratio'
    });
  }
};

module.exports = { adjustAspectRatio };