const fs = require('fs');
const formidable = require('formidable');
const cloudinary = require('../lib/cloudinaryConfig');
const path = require('path');

const ConvertRecording = function (req, res) {
    const form = new formidable.IncomingForm();
    console.log("Starting form parsing...");

    form.parse(req, async function (err, fields, files) {
        if (err) {
            console.error("Error parsing form:", err);
            return res.status(500).json({ error: 'Failed to parse the file' });
        }

        const videoFiles = files.video; // This may be an array
        const videoFile = Array.isArray(videoFiles) ? videoFiles[0] : videoFiles;

        if (!videoFile) {
            console.error('No video file found in the request');
            return res.status(400).json({ error: 'No video file uploaded' });
        }

        // Use Cloudinary to upload the video
        try {
            const result = await cloudinary.uploader.upload(videoFile.filepath, {
                resource_type: 'video', // Specify that it's a video
                public_id: videoFile.newFilename.replace(path.extname(videoFile.newFilename), ''), // Set a public ID without the extension
                overwrite: true // Overwrite if the file already exists
            });

            // Respond with the URL of the uploaded video
            console.log('Video uploaded successfully:', result.secure_url);
            res.status(200).json({ message: 'Video uploaded successfully', url: result.secure_url });
        } catch (uploadErr) {
            console.error('Failed to upload the video to Cloudinary:', uploadErr);
            res.status(500).json({ error: 'Failed to upload the video to Cloudinary' });
        }

        // Optional: Remove the local file after upload
        fs.unlink(videoFile.filepath, (unlinkErr) => {
            if (unlinkErr) {
                console.error('Failed to delete local file:', unlinkErr);
            }
        });
    });
};

module.exports = { ConvertRecording };
