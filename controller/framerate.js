const cloudinary = require('../lib/cloudinaryConfig');
const { StatusCodes } = require('http-status-codes');

const processFrameRate = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'No video file provided'
      });
    }

    const targetFps = req.body.targetFps;
    if (!targetFps) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Target FPS is required'
      });
    }

    // Create buffer stream from uploaded file
    const streamifier = require('streamifier');
    const stream = streamifier.createReadStream(req.file.buffer);

    // Upload to Cloudinary with frame rate transformation
    const uploadPromise = new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'video',
          folder: 'videos',
          transformation: [
            {
              fps: parseInt(targetFps),
              format: 'mp4'
            }
          ]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.pipe(uploadStream);
    });

    const result = await uploadPromise;

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Video processed successfully',
      videoUrl: result.secure_url,
      originalFilename: req.file.originalname,
      duration: result.duration,
      fps: targetFps
    });

  } catch (error) {
    console.error('Frame rate processing error:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error processing video',
      error: error.message
    });
  }
};

module.exports = {
  processFrameRate
};