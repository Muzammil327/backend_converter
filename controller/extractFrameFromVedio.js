const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const extractFrames = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No video file provided' });
        }

        const videoBuffer = req.file.buffer;
        const requestedFrames = parseInt(req.body.frameRate) || 1; 
        const outputDir = path.join(__dirname, '../uploads/frames');
        const tempVideoPath = path.join(__dirname, `../uploads/temp-${uuidv4()}.mp4`);

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(tempVideoPath, videoBuffer);

        const batchId = uuidv4();
        const framesPath = path.join(outputDir, batchId);
        fs.mkdirSync(framesPath);

        const getDuration = () => {
            return new Promise((resolve, reject) => {
                ffmpeg.ffprobe(tempVideoPath, (err, metadata) => {
                    if (err) reject(err);
                    resolve(metadata.format.duration);
                });
            });
        };

        const duration = await getDuration();

        const interval = duration / requestedFrames;

        await new Promise((resolve, reject) => {
            ffmpeg(tempVideoPath)
                .screenshots({
                    count: requestedFrames,
                    timemarks: Array.from({ length: requestedFrames }, (_, i) => 
                        Math.min(i * interval, duration - 0.001)  
                    ),
                    folder: framesPath,
                    filename: 'frame-%d.jpg',
                    size: '480x?'
                })
                .on('end', () => {
                    fs.unlinkSync(tempVideoPath);
                    resolve();
                })
                .on('error', (err) => {
                    fs.unlinkSync(tempVideoPath);
                    reject(err);
                });
        });

        const frames = fs.readdirSync(framesPath)
            .filter(file => file.endsWith('.jpg'))
            .map(file => `/uploads/frames/${batchId}/${file}`);

        res.json({ success: true, frames, batchId });

    } catch (error) {
        console.error('Error extracting frames:', error);
        res.status(500).json({ error: 'Failed to extract frames' });
    }
};

module.exports = { extractFrames };