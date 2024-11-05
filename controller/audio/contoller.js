const cloudinary = require('../../lib/cloudinaryConfig');
const formidable = require('formidable');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
// const fs = require('fs-extra');
const fs = require('fs');
const os = require('os');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const mixAudio = (req, res) => {
    const form = new formidable.IncomingForm();

    console.log('Starting audio file upload...');

    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error('Error parsing form:', err);
            return res.status(400).json({ error: 'Error parsing the files.', details: err });
        }

        console.log("File upload complete. Starting audio upload to local directory...");
        console.log("Parsed fields:", fields);
        console.log("Parsed files:", files);

        // Access the audio files correctly
        let audioFiles;
        if (files.audioFiles) {
            audioFiles = Array.isArray(files.audioFiles) ?
                files.audioFiles.map(file => file.filepath) :
                [files.audioFiles.filepath];
        } else {
            console.error('No audio files found in the upload.');
            return res.status(400).json({ error: 'No audio files uploaded.' });
        }

        console.log('Audio files received:', audioFiles);

        // Save audio files to the uploads directory
        const uploadDir = path.join(__dirname, '../../uploads');
        const uploadedAudioFiles = [];

        try {
            for (const file of audioFiles) {
                const fileName = path.basename(file);
                const destinationPath = path.join(uploadDir, fileName);
                await fs.copy(file, destinationPath);
                console.log(`Saved ${file} to local directory: ${destinationPath}`);
                uploadedAudioFiles.push(destinationPath);
                await fs.remove(file);
            }
        } catch (error) {
            console.error('Error saving audio files to local directory:', error.message);
            return res.status(500).json({ error: 'Failed to save audio files locally.' });
        }

        console.log("All audio files saved locally. Starting audio mixing...");

        // Prepare to mix audio files
        const outputAudioPath = path.join(uploadDir, `mixed_audio_${Date.now()}.wav`);
        console.log('Output audio path:', outputAudioPath);

        // Create an FFmpeg command
        const ffmpegCommand = ffmpeg();

        // Add input audio files for mixing
        uploadedAudioFiles.forEach((file) => {
            ffmpegCommand.input(file);
        });

        // Create the mixing command
        ffmpegCommand
            .outputOptions([
                '-filter_complex',
                `amix=inputs=${uploadedAudioFiles.length}:duration=longest:dropout_transition=3`, // Adjusted amix settings
            ])
            .output(outputAudioPath)
            .on('start', (commandLine) => {
                console.log('Spawned FFmpeg with command:', commandLine);
            })
            .on('end', async () => {
                console.log('Mixing finished!');

                try {
                    // Convert the mixed audio to MP3
                    const mp3OutputPath = outputAudioPath.replace('.wav', '.mp3');
                    await new Promise((resolve, reject) => {
                        ffmpeg()
                            .input(outputAudioPath)
                            .toFormat('mp3')
                            .output(mp3OutputPath)
                            .on('end', resolve)
                            .on('error', reject)
                            .run();
                    });

                    // Upload the mixed audio to Cloudinary
                    const cloudinaryUpload = await cloudinary.uploader.upload(mp3OutputPath, {
                        resource_type: 'raw',
                        public_id: `mixed_audio_${Date.now()}`,
                        overwrite: true,
                    });

                    // Clean up the temporary mixed audio files
                    await fs.remove(outputAudioPath);
                    await fs.remove(mp3OutputPath);

                    res.status(200).json({
                        message: 'Audio files mixed and uploaded successfully!',
                        url: cloudinaryUpload.secure_url
                    });
                } catch (error) {
                    console.error('Error uploading mixed audio to Cloudinary:', error.message);
                    res.status(500).json({ error: 'Failed to upload mixed audio to Cloudinary.' });
                }
            })
            .on('error', (error, stdout, stderr) => {
                console.error('Error mixing audios:', error.message);
                console.error('FFmpeg stdout:', stdout);
                console.error('FFmpeg stderr:', stderr);
                res.status(500).json({ error: 'Failed to mix audios. ' + error.message });
            })
            .run(); // Start the FFmpeg process
    });
};

const noiseReductionController = async (req, res) => {
    // Create a formidable instance to handle file uploads
    const form = new formidable.IncomingForm();

    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error('Error parsing files:', err);
            return res.status(400).send('Error parsing files');
        }

        // Log received files
        console.log('Uploaded files:', files);

        // Check if an audio file was uploaded
        const audioFile = files.audioFile;

        if (!audioFile || audioFile.length === 0) {
            return res.status(400).send('No audio file uploaded');
        }

        // Define the upload directory and the output file path for filtered audio
        const uploadDir = path.join(__dirname, '../../uploads'); // Local directory
        const filteredFilePath = path.join(uploadDir, `${audioFile[0].newFilename}-filtered.wav`);

        // Apply high-pass and low-pass filters using FFmpeg
        await new Promise((resolve, reject) => {
            ffmpeg(audioFile[0].filepath) // Process the first audio file
                .audioFilters('highpass=f=200, lowpass=f=3000')
                .save(filteredFilePath)
                .on('end', () => {
                    console.log(`Filtered audio saved to ${filteredFilePath}`);
                    resolve(); // Resolve the promise when done
                })
                .on('error', (err) => {
                    console.error('Error applying filters:', err);
                    reject(err); // Reject the promise on error
                });
        });

        // Upload the filtered audio file to Cloudinary
        try {
            const result = await cloudinary.uploader.upload(filteredFilePath, {
                resource_type: 'auto', // Automatically detect the resource type
            });
            console.log('Uploaded to Cloudinary:', result);

            // Clean up: remove the local filtered file
            fs.unlinkSync(filteredFilePath);

            return res.json({ message: 'Audio processed successfully', url: result.secure_url });
        } catch (error) {
            console.error('Cloudinary upload error:', error);
            return res.status(500).send('Error uploading processed audio to Cloudinary');
        }
    });
};

const convertChannelControl = (req, res) => {
    const form = new formidable.IncomingForm();

    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error('Error parsing the form:', err);
            return res.status(400).json({ error: 'Error parsing the file.' });
        }

        console.log('Parsed fields:', fields); // Log parsed fields
        console.log('Parsed files:', files); // Log parsed files

        // Check if audio file is uploaded
        if (!files.audio || files.audio.length === 0) {
            return res.status(400).json({ error: 'No audio file uploaded.' });
        }

        const inputFile = files.audio[0].filepath; // Access the uploaded file
        console.log('Input file path:', inputFile); // Log input file path
        if (!inputFile) {
            console.error('Input file path is undefined');
            return res.status(400).json({ error: 'Input file path is undefined' });
        }

        const outputDirectory = path.join(__dirname, '../../uploads');
        console.log('Output directory:', outputDirectory);
        if (!fs.existsSync(outputDirectory)) {
            fs.mkdirSync(outputDirectory, { recursive: true });
        }

        const outputFileName = `${Date.now()}.wav`;
        const outputFile = path.join(outputDirectory, outputFileName);

        try {
            ffmpeg(inputFile)
                .audioChannels(fields.channel[0] === 'mono' ? 1 : 2) // Access channel
                .toFormat('wav')
                .on('start', (commandLine) => {
                    console.log('Spawned FFmpeg with command: ' + commandLine);
                })
                .on('progress', (progress) => {
                    console.log('Processing: ' + progress.percent + '% done');
                })
                .on('end', async () => {
                    console.log('Conversion finished successfully');
                    try {
                        const result = await cloudinary.uploader.upload(outputFile, {
                            resource_type: 'auto',
                        });

                        if (fs.existsSync(inputFile)) {
                            fs.unlinkSync(inputFile); // Clean up input file
                        }
                        if (fs.existsSync(outputFile)) {
                            fs.unlinkSync(outputFile); // Clean up output file
                        }

                        res.status(200).json({ message: 'Conversion successful', output: result.secure_url });
                    } catch (uploadError) {
                        console.error('Error uploading to Cloudinary:', uploadError);
                        res.status(500).json({ error: 'Failed to upload to Cloudinary.' });
                    }
                })
                .on('error', (error) => {
                    console.error('Error during conversion:', error);
                    res.status(500).json({ error: 'Failed to convert audio.' });
                })
                .save(outputFile); // Save converted file
        } catch (error) {
            console.error('FFmpeg execution error:', error);
            res.status(500).json({ error: 'Failed to start FFmpeg.' });
        }
    });
};

const convertAudioExtractor = (req, res) => {
    const form = new formidable.IncomingForm();

    form.parse(req, async (err, fields, files) => {
        if (err) {
            return res.status(400).json({ error: 'Error parsing the file.' });
        }

        // Check if the file is present
        if (!files.video || files.video.length === 0) {
            return res.status(400).json({ error: 'No video file uploaded.' });
        }

        const inputFile = files.video[0].filepath; // Access the first file uploaded
        const outputFileName = `${Date.now()}.wav`;
        const outputFile = path.join(__dirname, '../../uploads', outputFileName); // Ensure this directory exists

        ffmpeg(inputFile)
            .toFormat('wav')
            .on('end', async () => {
                console.log('Audio extraction finished successfully');

                // Optional: Upload to Cloudinary
                try {
                    const result = await cloudinary.uploader.upload_stream(outputFile, {
                        resource_type: 'auto', // Use 'auto' to handle different file types
                    });

                    // Clean up temporary files
                    fs.unlinkSync(inputFile); // Delete the uploaded video file
                    fs.unlinkSync(outputFile); // Delete the extracted audio file

                    // Respond with the Cloudinary URL
                    res.status(200).json({ message: 'Audio extraction successful', url: result.secure_url });
                } catch (uploadError) {
                    console.error('Error uploading to Cloudinary:', uploadError);
                    res.status(500).json({ error: 'Failed to upload to Cloudinary.' });
                }
            })
            .on('error', (error) => {
                console.error('Error extracting audio:', error);
                res.status(500).json({ error: 'Failed to extract audio.' });
            })
            .save(outputFile); // Save the extracted audio file
    });
};

const removeSilence = (req, res) => {
    const form = new formidable.IncomingForm();

    form.parse(req, (err, fields, files) => {
        if (err) {
            return res.status(400).json({ error: 'Error parsing the file.' });
        }

        // Check if the file is present
        if (!files.audio || files.audio.length === 0) {
            return res.status(400).json({ error: 'No audio file uploaded.' });
        }

        const inputFile = files.audio[0].filepath; // Access the first file uploaded
        const outputFileName = `${Date.now()}.wav`;
        const outputFile = path.join(__dirname, '../../uploads', outputFileName);

        // Process the audio to remove silence
        ffmpeg(inputFile)
            .audioFilters('silenceremove=1:0:-50dB') // Adjust parameters as needed
            .toFormat('wav')
            .on('end', async () => {
                console.log('Silence removal finished successfully');

                // Upload the processed audio to Cloudinary
                try {
                    const result = await cloudinary.uploader.upload(outputFile, {
                        resource_type: 'video', // Use 'video' for audio files in Cloudinary
                    });

                    // Clean up temporary files
                    fs.unlinkSync(inputFile); // Delete the uploaded file
                    fs.unlinkSync(outputFile); // Delete the processed file

                    // Respond with the Cloudinary URL
                    res.status(200).json({ message: 'Silence removal successful!', url: result.secure_url });
                } catch (uploadError) {
                    console.error('Error uploading to Cloudinary:', uploadError);
                    res.status(500).json({ error: 'Failed to upload to Cloudinary.' });
                }
            })
            .on('error', (error) => {
                console.error('Error processing audio:', error);
                res.status(500).json({ error: 'Failed to process audio.' });
            })
            .save(outputFile);
    });
};

const convertVolumeAdjustment = (req, res) => {
    const form = new formidable.IncomingForm();

    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error('Error parsing the form:', err);
            return res.status(400).json({ error: 'Error parsing the file.' });
        }

        console.log('Received fields:', fields);
        console.log('Received files:', files);

        // Check if the file is present
        if (!files.audio || files.audio.length === 0) {
            return res.status(400).json({ error: 'No audio file uploaded.' });
        }

        const inputFile = files.audio[0].filepath; // Access the first file uploaded
        const volume = parseFloat(fields.volume);
        if (isNaN(volume) || volume < 0 || volume > 2) {
            return res.status(400).json({ error: 'Invalid volume value. Must be between 0 and 2.' });
        }

        const outputFileName = `${Date.now()}_adjusted.wav`;
        const outputFile = path.join(__dirname, '../../uploads', outputFileName);

        ffmpeg(inputFile)
            .audioFilters(`volume=${volume}`)
            .toFormat('wav')
            .on('end', async () => {
                console.log('Volume adjustment finished successfully');
                // Optional: Upload to Cloudinary
                try {
                    const result = await cloudinary.uploader.upload(outputFile, {
                        resource_type: 'auto',
                    });

                    // Clean up temporary files
                    fs.unlinkSync(inputFile);
                    fs.unlinkSync(outputFile);

                    res.status(200).json({ message: 'Volume adjusted successfully', url: result.secure_url });
                } catch (uploadError) {
                    console.error('Error uploading to Cloudinary:', uploadError);
                    res.status(500).json({ error: 'Failed to upload to Cloudinary.' });
                }
            })
            .on('error', (error) => {
                console.error('Error adjusting volume:', error);
                res.status(500).json({ error: 'Failed to adjust volume.' });
            })
            .save(outputFile);
    });
};

module.exports = { mixAudio, noiseReductionController, convertChannelControl, convertAudioExtractor, removeSilence, convertVolumeAdjustment };
