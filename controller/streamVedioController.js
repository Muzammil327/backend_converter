const formidable = require('formidable');
const path = require('path');
const fs = require('fs');
const cloudinary = require('../lib/cloudinaryConfig');

const convertStream = (req, res) => {
    const form = new formidable.IncomingForm();

    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error('[Streaming Error] Failed to parse form data:', err);
            return res.status(400).json({ error: 'Error parsing the form data' });
        }

        console.log('[Debug] Parsed fields:', fields);
        console.log('[Debug] Parsed files:', files);

        const videoFiles = files.video;
        console.log('[Debug] Video files:', videoFiles);

        const videoFile = Array.isArray(videoFiles) ? videoFiles[0] : videoFiles;
        console.log('[Debug] Selected video file:', videoFile);

        if (!videoFile) {
            console.error('[Streaming Error] No video chunk received');
            return res.status(400).json({ error: 'No video file received' });
        }

        try {
            console.log('[Streaming Info] Uploading video chunk to Cloudinary...', videoFile.filepath);
            const result = await cloudinary.uploader.upload(videoFile.filepath, {
                resource_type: 'video',
                public_id: videoFile.newFilename.replace(path.extname(videoFile.newFilename), ''),
                overwrite: true,
            });

            console.log('[Streaming Success] Video chunk uploaded successfully:', result.secure_url);
            res.status(200).json({ message: 'Video chunk uploaded successfully', url: result.secure_url });
        } catch (uploadErr) {
            console.error('[Streaming Error] Failed to upload video chunk to Cloudinary:', uploadErr);
            res.status(500).json({ error: 'Failed to upload the video chunk to Cloudinary' });
        } finally {
            if (videoFile.filepath && fs.existsSync(videoFile.filepath)) {
                console.log('[Debug] Temp file exists, deleting:', videoFile.filepath);
                fs.unlink(videoFile.filepath, (err) => {
                    if (err) console.error('[Cleanup Error] Failed to delete temp file:', err);
                    else console.log('[Cleanup Info] Temporary file deleted successfully');
                });
            } else {
                console.log('[Debug] Temp file not found at path:', videoFile.filepath);
            }
        }
    });
};

module.exports = { convertStream };
