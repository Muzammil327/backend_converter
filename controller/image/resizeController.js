const formidable = require('formidable');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const cloudinary = require('../../lib/cloudinaryConfig');

const convertImageResize = (req, res) => {
    const form = new formidable.IncomingForm();

    form.parse(req, (err, fields, files) => {
        if (err) {
            console.error('Error parsing the form:', err);
            return res.status(400).send('Error parsing form data');
        }

        const requestedWidth = parseInt(fields.width[0], 10);
        const requestedHeight = parseInt(fields.height[0], 10);
        const imagePath = files.image[0].filepath;

        console.log('Image path:', imagePath);
        if (!fs.existsSync(imagePath)) {
            return res.status(400).send('Image file not found.');
        }

        ffmpeg.ffprobe(imagePath, (err, metadata) => {
            if (err) {
                console.error('Error reading image metadata:', err);
                return res.status(500).send('Error reading image metadata');
            }

            const actualWidth = metadata.streams[0].width;
            const actualHeight = metadata.streams[0].height;

            const width = Math.min(requestedWidth, actualWidth);
            const height = Math.min(requestedHeight, actualHeight);
            const tempDir = path.join(__dirname, '../temp');

            // Ensure the temporary directory exists
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir);
            }

            const tempOutputFile = path.join(__dirname, '../../uploads', `${Date.now()}.webp`);

            ffmpeg(imagePath)
                .outputOptions([
                    `-vf crop=${width}:${height}:0:0`,
                    '-loglevel verbose' // Enable detailed logging
                ])
                .on('end', () => {
                    // Upload the cropped image file to Cloudinary
                    cloudinary.uploader.upload(tempOutputFile, (error, result) => {
                        fs.unlinkSync(tempOutputFile); // Delete the temp file after uploading

                        if (error) {
                            console.error('Error uploading to Cloudinary:', error);
                            return res.status(500).send('Error uploading to Cloudinary');
                        }

                        console.log('Image uploaded successfully:', result.url);
                        res.send({ url: result.url });
                    });
                })
                .on('error', (err) => {
                    console.error('Error cropping image:', err);
                    console.error('FFmpeg error message:', err.message);
                    res.status(500).send('Error cropping image');
                })
                .save(tempOutputFile); // Save cropped image to a temporary file
        });
    });
};

module.exports = { convertImageResize };
