const formidable = require('formidable');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const cloudinary = require('../../lib/cloudinaryConfig');

const ffmpegPath = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegPath);

const convertImage = (req, res) => {
    const form = new formidable.IncomingForm();

    form.parse(req, (err, fields, files) => {
        if (err) {
            return res.status(400).json({ error: 'Error parsing the file.' });
        }

        const inputFile = files.image[0].filepath;

        // Create a temporary output file path for the converted image
        const tempOutputFile = path.join(__dirname, '../../uploads', `${Date.now()}.webp`);

        ffmpeg(inputFile)
            .toFormat('webp')
            .on('end', async () => {
                try {
                    // Upload the converted image
                    const result = await cloudinary.uploader.upload(tempOutputFile, {
                        resource_type: 'image'
                    });

                    // Respond with the Cloudinary URL
                    res.status(200).json({ message: 'Conversion successful', url: result.secure_url });

                    // Clean up temporary files
                    fs.unlinkSync(inputFile);
                    fs.unlinkSync(tempOutputFile);
                } catch (uploadError) {
                    console.error('Error uploading to Cloudinary:', uploadError);
                    res.status(500).json({ error: 'Failed to upload to Cloudinary.' });
                }
            })
            .on('error', (error) => {
                console.error('Error converting file:', error);
                res.status(500).json({ error: 'Failed to convert image.' });
            })
            .save(tempOutputFile); // Save the converted file to the temporary output path
    });
};

module.exports = { convertImage };
