const formidable = require('formidable');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const cloudinary = require('../../lib/cloudinaryConfig');

const ResolutionScaling = (req, res) => {
    const form = new formidable.IncomingForm();

    form.parse(req, (err, fields, files) => {
        if (err) {
            console.error('Error parsing the file:', err);
            return res.status(400).json({ error: 'Error parsing the file' });
        }

        console.log('Parsed files:', files); // Log the entire files object

        // Access the first element of the video array
        if (!files.video || files.video.length === 0) {
            return res.status(400).json({ error: 'No video file uploaded' });
        }

        const inputFilePath = files.video[0].filepath; // Correctly access filepath
        const { resolution } = fields; // Get resolution from the fields
        const outputFileName = `resized-${resolution}-${Date.now()}.mp4`;
        const outputFilePath = path.join('uploads', outputFileName); // Path for the output file

        console.log('Input file path:', inputFilePath);

        // Check if input file exists
        fs.access(inputFilePath, fs.constants.F_OK, (err) => {
            if (err) {
                console.error('Input file does not exist:', err);
                return res.status(400).json({ error: 'Input file does not exist' });
            }

            // Resolution mapping
            const resolutionMap = {
                '1080p': '1920:1080',
                '720p': '1280:720',
                '480p': '854:480',
            };

            console.log('Resolution requested:', resolution);
            if (!resolutionMap[resolution]) {
                return res.status(400).json({ error: 'Invalid resolution' });
            }

            console.log(`Running FFmpeg with scale=${resolutionMap[resolution]} on ${inputFilePath}`);

            // FFmpeg command for resizing the video
            ffmpeg(inputFilePath)
                .outputOptions('-vf', `scale=${resolutionMap[resolution]}`)
                .outputFormat('mp4') // Specify output format
                .on('stderr', (stderrLine) => {
                    console.error('FFmpeg stderr:', stderrLine);
                })
                .on('end', () => {
                    console.log('FFmpeg processing completed');
                    // Upload to Cloudinary
                    cloudinary.uploader.upload(outputFilePath, { resource_type: 'video' }, (uploadError, result) => {
                        // Cleanup and respond
                        fs.unlinkSync(inputFilePath);
                        fs.unlinkSync(outputFilePath);

                        if (uploadError) {
                            console.error('Error uploading to Cloudinary:', uploadError);
                            return res.status(500).json({ error: 'Upload to Cloudinary failed' });
                        }

                        res.status(200).json({ url: result.secure_url });
                    });
                })
                .on('error', (error) => {
                    console.error('Error during FFmpeg processing:', error);
                    res.status(500).json({ error: 'Video processing failed' });
                })
                .save(outputFilePath);
        });
    });
};

const BitrateControl = (req, res) => {
    const form = new formidable.IncomingForm();

    form.parse(req, (err, fields, files) => {
        if (err) {
            console.error('Error parsing the file:', err);
            return res.status(400).json({ error: 'Error parsing the file' });
        }

        console.log('Received fields:', fields);
        console.log('Received files:', files);

        const { bitrateType, bitrate } = fields;
        const inputFilePath = files.video[0]?.filepath;
        if (!inputFilePath) {
            console.error('Input file path is undefined. Please ensure the file is uploaded correctly.');
            return res.status(400).json({ error: 'Input file is required.' });
        }

        const outputFileName = `compressed-${bitrateType}-${Date.now()}.mp4`;
        const outputFilePath = path.join(__dirname, '../../uploads', outputFileName);

        console.log(`Input file path: ${inputFilePath}`);
        console.log(`Output file path: ${outputFilePath}`);
        console.log(`Bitrate Type: ${bitrateType}, Bitrate: ${bitrate}k`);

        // FFmpeg command for setting bitrate
        ffmpeg(inputFilePath)
            .outputOptions([
                `-b:v ${bitrate[0]}k`,
                bitrateType[0] === 'variable' ? `-maxrate ${bitrate[0]}k` : null,
                bitrateType[0] === 'variable' ? `-bufsize ${bitrate[0]}k` : null
            ].filter(Boolean)) // Filter out null values
            .toFormat('mp4') // Specify output format explicitly
            .on('stderr', (stderrLine) => {
                console.error('FFmpeg stderr:', stderrLine);
            })
            .on('end', () => {
                console.log('FFmpeg processing finished successfully.');
                // Upload to Cloudinary
                cloudinary.uploader.upload(outputFilePath, { resource_type: 'video' }, (uploadError, result) => {
                    fs.unlinkSync(inputFilePath);
                    fs.unlinkSync(outputFilePath);

                    if (uploadError) {
                        console.error('Error uploading to Cloudinary:', uploadError);
                        return res.status(500).json({ error: 'Upload to Cloudinary failed' });
                    }

                    res.status(200).json({ url: result.secure_url });
                });
            })
            .on('error', (error) => {
                console.error('Error during FFmpeg processing:', error);
                res.status(500).json({ error: 'Video processing failed' });
            })
            .save(outputFilePath);
    });
};


const FormatCompatibility = (req, res) => {
    const form = new formidable.IncomingForm();

    form.parse(req, (err, fields, files) => {
        if (err) {
            console.error('Error parsing the file:', err);
            return res.status(400).json({ error: 'Error parsing the file' });
        }

        console.log('Parsed Fields:', fields);
        console.log('Uploaded Files:', files);

        const { format } = fields; // Get format from fields
        const inputFilePath = files.video[0].filepath; // Access the first file in the array

        if (!inputFilePath) {
            console.error('Input file path is undefined. Check if the file was uploaded correctly.');
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const outputFileName = `converted-${Date.now()}.${format}`;
        const outputFilePath = path.join('uploads', outputFileName); // Path for the output file

        const formatMap = {
            mp4: 'libx264',
            webm: 'libvpx',
            avi: 'mpeg4',
            mkv: 'copy' // Adjust based on desired codec/requirements
        };

        if (!formatMap[format]) {
            return res.status(400).json({ error: 'Unsupported format' });
        }

        console.log(`Processing video: ${inputFilePath}, Output: ${outputFilePath}, Format: ${format}`);

        // FFmpeg command for format conversion
        ffmpeg(inputFilePath)
        .outputOptions([
            '-c:v libvpx',   // Use VP8 codec for WebM
            '-b:v 1M',       // Set video bitrate (adjust as needed)
            '-c:a libvorbis', // Use Vorbis audio codec for WebM
            '-b:a 128k',     // Set audio bitrate
            '-strict experimental' // Allow experimental features if using AAC
        ])
        .outputFormat('webm') // Specify output format
        .on('stderr', (stderrLine) => {
            console.error('FFmpeg stderr:', stderrLine);
        })
        .on('end', () => {
            // Upload to Cloudinary
            cloudinary.uploader.upload(outputFilePath, { resource_type: 'video' }, (uploadError, result) => {
                // Cleanup and respond
                fs.unlinkSync(inputFilePath);
                fs.unlinkSync(outputFilePath);
    
                if (uploadError) {
                    console.error('Error uploading to Cloudinary:', uploadError);
                    return res.status(500).json({ error: 'Upload to Cloudinary failed' });
                }
    
                res.status(200).json({ url: result.secure_url });
            });
        })
        .on('error', (error) => {
            console.error('Error during FFmpeg processing:', error);
            res.status(500).json({ error: 'Video processing failed' });
        })
        .save(outputFilePath);
    
    });
};


module.exports = { ResolutionScaling, BitrateControl, FormatCompatibility };