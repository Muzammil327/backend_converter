const formidable = require('formidable');
const ffmpeg = require('fluent-ffmpeg');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const exec = require('child_process').exec;

const filterVideo = (req, res) => {
    const form = new formidable.IncomingForm();
    console.log("Formidable instance created");

    form.parse(req, (err, fields, files) => {
        if (err) {
            console.error('Error parsing files:', err);
            return res.status(400).send('Error parsing files');
        }

        console.log("Form parsed successfully");
        console.log("files:", files);

        // Ensure files are being received correctly
        if (!files.videoFile || files.videoFile.length === 0) {
            return res.status(400).send('No video file uploaded');
        }

        const videoFile = files.videoFile[0]; // Get the uploaded video
        const filter = String(fields.filter).trim(); // Ensure filter is treated as a string
        console.log(`Uploaded file: ${videoFile.originalFilename}`);
        console.log(`Selected filter: ${filter}`);

        // Log the type and value of the filter
        console.log(`Filter type: ${typeof filter}, value: '${filter}'`);

        const outputPath = path.join(__dirname, '../../uploads', `${videoFile.newFilename}-filtered.mp4`);
        console.log(`Output path set to: ${outputPath}`);

        // Use the provided filter directly
        console.log(`Using filter command: ${filter}`);

        ffmpeg(videoFile.filepath)
            .outputOptions([`-vf ${filter}`])
            .on('start', command => {
                console.log('Spawned FFmpeg with command: ' + command);
            })
            .on('progress', progress => {
                console.log(`Processing: ${progress.percent}% done`);
            })
            .on('stderr', stderr => {
                console.error('FFmpeg stderr:', stderr); // Capture FFmpeg stderr for more details
            })
            .on('end', async () => {
                console.log('Processing finished, checking output file');

                // Check if the output file exists
                if (fs.existsSync(outputPath)) {
                    console.log('Output file exists, starting upload to Cloudinary');
                    try {
                        const result = await cloudinary.uploader.upload(outputPath, {
                            resource_type: 'video', // Specify resource type for videos
                        });
                        console.log('Uploaded to Cloudinary:', result);
                        return res.json({ url: result.secure_url });
                    } catch (uploadError) {
                        console.error('Cloudinary upload error:', uploadError);
                        return res.status(500).send(`Error uploading to Cloudinary: ${uploadError.message}`);
                    }
                } else {
                    console.error('Output file does not exist:', outputPath);
                    return res.status(500).send('Output file not found for upload.');
                }
            })
            .on('error', (processError) => {
                console.error('Error processing video:', processError);
                return res.status(500).send('Error processing video');
            })
            .save(outputPath);
    });
};

const textOverlay = async (req, res) => {
    console.log("Starting text overlay processing...");

    const form = new formidable.IncomingForm();
    form.uploadDir = path.join(__dirname, '../../uploads');
    form.keepExtensions = true;

    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error("Error parsing files:", err);
            return res.status(400).json({ error: 'Error parsing the files' });
        }

        console.log("Parsed fields:", fields);
        console.log("Parsed files:", files);

        const videoPath = files.video[0].filepath;
        console.log("Uploaded video path:", videoPath);

        const outputFilePath = path.join(form.uploadDir, `output_${Date.now()}.mp4`);
        const text = fields.text[0];
        const font = fields.font[0];
        const color = fields.color[0];
        const fontSize = fields.fontSize[0];

        console.log("Processing video with text:", text);
        console.log("Font:", font, "Color:", color, "Font Size:", fontSize);

        // Updated FFmpeg command with improved text placement and visibility
        const ffmpegCommand = [
            '-vf',
            `drawtext=text='${text}':fontfile='C\\Windows\\Fonts\\Georgia.ttf':fontcolor=${color}:fontsize=${fontSize}:x=150:y=150`,
            '-c:a', 'copy' // Copy the audio stream without re-encoding
        ];

        // Execute FFmpeg with the modified command

        console.log("FFmpeg Command:", ffmpegCommand);

        ffmpeg(videoPath)
            .outputOptions(ffmpegCommand)
            .on('stderr', function (stderrLine) {
                console.log('FFmpeg stderr: ' + stderrLine);
            })
            .save(outputFilePath)
            .on('end', async () => {
                console.log('Video processing finished:', outputFilePath);

                try {
                    const result = await cloudinary.uploader.upload(outputFilePath, {
                        resource_type: 'video',
                        public_id: `output_${Date.now()}`,
                        overwrite: true,
                    });

                    console.log("Video uploaded to Cloudinary:", result);
                    res.json({ url: result.secure_url });

                    // Clean up uploaded file after processing
                    fs.unlink(videoPath, (err) => {
                        if (err) console.error('Error deleting uploaded video:', err);
                    });

                    fs.unlink(outputFilePath, (err) => {
                        if (err) console.error('Error deleting processed video:', err);
                    });

                } catch (uploadError) {
                    console.error('Error uploading to Cloudinary:', uploadError);
                    res.status(500).send('Error uploading video to Cloudinary');
                }
            })
            .on('error', (err) => {
                console.error('Error processing video:', err);
                res.status(500).send('Error processing video');
            });
    });
}

const subtitles = async (req, res) => {
    const form = new formidable.IncomingForm();

    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error('Form parse error:', err);
            return res.status(500).json({ error: 'Failed to parse form data' });
        }

        console.log('Parsed fields:', fields);
        console.log('Parsed files:', files);

        const videoFile = files.video[0];
        if (!videoFile || !videoFile.originalFilename) {
            console.error('Video file is missing or invalid:', videoFile);
            return res.status(400).json({ error: 'Video file is missing or invalid.' });
        }

        const subtitlesText = fields.subtitles[0]; // Get the first subtitle text
        const subtitleFormat = fields.subtitleFormat[0]; // Get the first subtitle format

        // Define output paths
        const videoPath = path.join(process.cwd(), 'uploads', videoFile.originalFilename);
        const subtitlePath = path.join(process.cwd(), 'uploads', 'subtitles.' + subtitleFormat);
        const outputVideoPath = path.join(process.cwd(), 'uploads', 'output_' + videoFile.originalFilename);

        console.log('Video path:', videoPath);
        console.log('Subtitle path:', subtitlePath);
        console.log('Output video path:', outputVideoPath);

        // Save the video file
        fs.copyFile(videoFile.filepath, videoPath, async (err) => {
            if (err) {
                console.error('Error saving video file:', err);
                return res.status(500).json({ error: 'Failed to save video file' });
            }

            // Write subtitles to a file
            fs.writeFile(subtitlePath, subtitlesText.trim(), async (err) => {
                if (err) {
                    console.error('Error saving subtitles:', err);
                    return res.status(500).json({ error: 'Failed to save subtitles' });
                }

                // Use FFmpeg to add subtitles
                ffmpeg()
                    .input(videoPath) // Input video
                    .inputFormat('mp4') // Specify the input format
                    .input(subtitlePath) // Input subtitle file
                    .inputFormat('srt') // Specify the subtitle format
                    .outputOptions('-vf', `subtitles=${subtitlePath}`) // Use the subtitles filter
                    .outputOptions('-c:v libx264') // Re-encode video codec (required when using filters)
                    .outputOptions('-c:a copy') // Copy audio codec
                    .on('start', (commandLine) => {
                        console.log('Spawned FFmpeg with command: ' + commandLine);
                    })
                    .save(outputVideoPath)
                    .on('end', async () => {
                        console.log('Processing finished successfully');

                        // Optionally, upload the output video to Cloudinary or respond with the URL
                        cloudinary.uploader.upload(outputVideoPath, { resource_type: "video" }, (error, result) => {
                            if (error) {
                                console.error('Cloudinary upload error:', error);
                                return res.status(500).json({ error: 'Failed to upload video to Cloudinary' });
                            }

                            // Respond with the URL of the uploaded video
                            res.status(200).json({ videoUrl: result.secure_url });
                        });
                    })
                    .on('error', (err) => {
                        console.error('Error during processing:', err);
                        return res.status(500).json({ error: 'Failed to process video with subtitles' });
                    });

            });
        });
    });
};

module.exports = { filterVideo, textOverlay, subtitles };
