const formidable = require('formidable');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const cloudinary = require('../lib/cloudinaryConfig');

const convertTrimVedio = (req, res) => {
    const form = new formidable.IncomingForm();

    form.parse(req, (err, fields, files) => {
        if (err) {
            console.error('Error parsing the form:', err);
            return res.status(400).json({ error: 'Error parsing the file' });
        }

        const { start, end } = fields;
        const inputFilePath = files.video[0].filepath; // Accessing the first video file
        const outputDirectory = path.join(__dirname, 'uploads'); // Define output directory
        const outputFilePath = path.join(outputDirectory, `trimmed_${Date.now()}.mp4`);

        // Check if the uploads directory exists, and create it if it doesn't
        if (!fs.existsSync(outputDirectory)) {
            fs.mkdirSync(outputDirectory, { recursive: true }); // Create the directory
        }

        // Convert start and end to numbers
        const startTime = parseFloat(start); // Convert to float
        const endTime = parseFloat(end); // Convert to float
        const duration = endTime - startTime; // Calculate duration

        // Validate input
        if (isNaN(startTime) || isNaN(endTime) || duration <= 0) {
            console.error('Invalid start or end time.');
            return res.status(400).json({ error: 'Invalid start or end time.' });
        }

        // Trim the video using ffmpeg
        ffmpeg(inputFilePath)
            .setStartTime(startTime) // Set start time
            .setDuration(duration)    // Set duration
            .output(outputFilePath)
            .on('end', async () => {
                console.log('Video trimming completed successfully.');

                // Upload to Cloudinary
                try {
                    const result = await cloudinary.uploader.upload(outputFilePath, {
                        resource_type: 'video',
                    });

                    // Clean up local files
                    fs.unlinkSync(outputFilePath);
                    fs.unlinkSync(inputFilePath); // Remove the uploaded file

                    console.log('Video uploaded to Cloudinary:', result.secure_url);
                    res.json({ message: 'Video trimmed and uploaded successfully', url: result.secure_url });
                } catch (uploadError) {
                    console.error('Error uploading to Cloudinary:', uploadError);
                    res.status(500).json({ error: 'Failed to upload video to Cloudinary' });
                }
            })
            .on('error', (ffmpegError) => {
                console.error('Error trimming video:', ffmpegError);
                res.status(500).json({ error: 'Failed to trim video' });
            })
            .run();
    });
};

module.exports = { convertTrimVedio };
