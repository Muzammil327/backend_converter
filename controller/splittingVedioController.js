const formidable = require('formidable');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const cloudinary = require('../lib/cloudinaryConfig');

const convertSplitVedio = (req, res) => {
    const form = new formidable.IncomingForm();

    form.parse(req, (err, fields, files) => {
        if (err) {
            console.error('Error parsing the form:', err);
            return res.status(400).json({ error: 'Error parsing the file' });
        }

        const videoFile = files.video[0];
        const splitTime = parseInt(fields.splitTime, 10);

        if (!videoFile) {
            console.error('No video file uploaded');
            return res.status(400).json({ error: 'No video file uploaded' });
        }

        if (isNaN(splitTime) || splitTime <= 0) {
            console.error('Invalid split time:', fields.splitTime);
            return res.status(400).json({ error: 'Invalid split time. Please provide a positive number.' });
        }

        const videoPath = videoFile.filepath;
        const outputDir = path.join(__dirname, 'output');

        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir);
            console.log('Created output directory:', outputDir);
        }

        const outputFilePath1 = path.join(outputDir, 'split_part_1.mp4');
        const outputFilePath2 = path.join(outputDir, 'split_part_2.mp4');

        // Split the video
        ffmpeg(videoPath)
            .setDuration(splitTime) // First part
            .output(outputFilePath1)
            .on('end', () => {
                console.log('First part created:', outputFilePath1);

                // Upload first part to Cloudinary
                cloudinary.uploader.upload(outputFilePath1, { resource_type: "video" }, (error, result) => {
                    if (error) {
                        console.error('Error uploading first part:', error);
                        return res.status(500).json({ error: 'Failed to upload first part' });
                    }
                    const url1 = result.secure_url;

                    ffmpeg(videoPath)
                        .setStartTime(splitTime) // Second part starts from splitTime
                        .output(outputFilePath2)
                        .on('end', () => {
                            console.log('Second part created:', outputFilePath2);

                            // Upload second part to Cloudinary
                            cloudinary.uploader.upload(outputFilePath2, { resource_type: "video" }, (error, result) => {
                                if (error) {
                                    console.error('Error uploading second part:', error);
                                    return res.status(500).json({ error: 'Failed to upload second part' });
                                }
                                const url2 = result.secure_url;

                                // Respond with the URLs of both parts
                                res.status(200).json({ urls: [url1, url2] });

                                // Cleanup local files
                                fs.unlinkSync(outputFilePath1);
                                fs.unlinkSync(outputFilePath2);
                            });
                        })
                        .on('error', (error) => {
                            console.error('Error splitting second part of video:', error);
                            res.status(500).json({ error: 'Failed to split video' });
                        })
                        .run();
                });
            })
            .on('error', (error) => {
                console.error('Error splitting first part of video:', error);
                res.status(500).json({ error: 'Failed to split video' });
            })
            .run();
    });
};

module.exports = { convertSplitVedio };
