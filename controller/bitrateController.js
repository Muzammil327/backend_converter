const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");
const cloudinary = require('../lib/cloudinaryConfig');

exports.adjustBitrate = (req, res) => {
  const { bitrate } = req.body;
  const videoFile = req.file;

  if (!bitrate || !videoFile) {
    return res.status(400).json({ message: "Bitrate and video file are required." });
  }

  const tempOutputFilePath = path.join(__dirname, "../uploads", `output_${Date.now()}.mp4`);

  // Adjust the bitrate using FFmpeg
  ffmpeg(videoFile.path)
  .inputOptions('-v debug') // Enable debug logs
  .videoBitrate(bitrate)
  .outputOptions("-preset fast")
  .save(tempOutputFilePath)
  .on('start', (commandLine) => {
    console.log('FFmpeg command:', commandLine);
  })
  .on("end", async () => {
      // Upload processed video to Cloudinary
      try {
        const result = await cloudinary.uploader.upload(tempOutputFilePath, {
          resource_type: "video",
        });

        // Send the Cloudinary URL as a response
        res.json({ url: result.secure_url });

        // Clean up local files
        fs.unlinkSync(tempOutputFilePath);
        fs.unlinkSync(videoFile.path);
      } catch (err) {
        console.error("Error uploading to Cloudinary:", err);
        res.status(500).json({ message: "Error uploading to Cloudinary" });
      }
    })
    .on("error", (err) => {
      console.error("Error processing video:", err);
      res.status(500).json({ message: "Error processing video" });
    });
};
