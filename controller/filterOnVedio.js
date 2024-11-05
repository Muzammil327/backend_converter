const { Readable } = require('stream');
const cloudinary = require('../lib/cloudinaryConfig');

exports.applyFilter = async (req, res) => {
  const video = req.file;
  const filter = req.body.filter;

  if (!video) {
    return res.status(400).json({ error: "No video file provided" });
  }

  try {
    let filterTransformation;
    switch (filter) {
      case 'blur':
        filterTransformation = { effect: "blur:200", quality: "auto:best" };
        break;
      case 'sharpen':
        filterTransformation = { effect: "sharpen", quality: "auto:best", width: 1920, height: 1080, crop: "scale" }; // Set to 1080p
        break;
      default:
        return res.status(400).json({ error: "Unsupported filter" });
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "video",
        transformation: [filterTransformation],
      },
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          return res.status(500).json({ error: "Cloudinary upload failed" });
        }
        if (result && result.secure_url) {
          res.json({ url: result.secure_url, message: `Applied ${filter} filter successfully` });
        } else {
          res.status(500).json({ error: "Video processing failed, no URL returned" });
        }
      }
    );

    const readableStream = Readable.from(video.buffer);
    readableStream.pipe(uploadStream);

  } catch (error) {
    console.error("Error processing video:", error);
    res.status(500).json({ error: "Failed to process video" });
  }
};
