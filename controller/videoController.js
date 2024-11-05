const formidable = require('formidable');
const ffmpeg = require('fluent-ffmpeg');
const cloudinary = require('../lib/cloudinaryConfig');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const fs = require('fs')
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const mergeVideos = (req, res) => {
    const form = new formidable.IncomingForm();

    console.log('Starting file upload...');

    form.parse(req, async (err, fields, files) => {
        if (err) {
            return res.status(400).json({ error: 'Error parsing the files.' });
        }

        console.log("File upload complete. Starting video upload to Cloudinary...");

        const videoFiles = Object.values(files.video).map(file => file.filepath);

        if (videoFiles.length === 0) {
            return res.status(400).json({ error: 'No video files uploaded.' });
        }

        // Step 1: Upload videos to Cloudinary and store URLs
        const uploadedVideoURLs = [];
        try {
            for (const file of videoFiles) {
                const result = await cloudinary.uploader.upload(file, { resource_type: 'video' });
                uploadedVideoURLs.push(result.secure_url);
                await fs.remove(file); // Optionally, delete the local file after upload
            }
        } catch (error) {
            console.error('Error uploading to Cloudinary:', error.message);
            return res.status(500).json({ error: 'Failed to upload video files to Cloudinary.' });
        }

        console.log("All videos uploaded to Cloudinary. Starting video merge...");

        // Step 2: Prepare to merge videos using a stream
        const ffmpegCommand = ffmpeg();

        // Add each video URL as input to ffmpeg
        uploadedVideoURLs.forEach(url => ffmpegCommand.input(url));

        ffmpegCommand
            .complexFilter(
                uploadedVideoURLs.map((_, index) => `[${index}:v]scale=640:360,fps=30[v${index}];[${index}:a]anull[a${index}]`).join(';') +
                ';' + uploadedVideoURLs.map((_, index) => `[v${index}][a${index}]`).join('') +
                `concat=n=${uploadedVideoURLs.length}:v=1:a=1[outv][outa]`,
                ['outv', 'outa']
            )
            .outputFormat('mp4') // Specify the format
            .on('end', () => {
                console.log('Merging finished!');
            })
            .on('error', (error) => {
                console.error('Error merging videos:', error.message);
                res.status(500).json({ error: 'Failed to merge videos. ' + error.message });
            })
            .pipe(cloudinary.uploader.upload_stream(
                { resource_type: 'video', public_id: `merged_video_${Date.now()}` },
                (error, result) => {
                    if (error) {
                        console.error('Error uploading merged video to Cloudinary:', error.message);
                        res.status(500).json({ error: 'Failed to upload merged video to Cloudinary.' });
                    } else {
                        console.log('Merged video uploaded successfully!');
                        res.status(200).json({
                            message: 'Videos merged and uploaded successfully!',
                            url: result.secure_url // URL of the uploaded merged video
                        });
                    }
                }
            ));
    });
};

module.exports = { mergeVideos };
