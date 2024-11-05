const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

const cropVideo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    const inputVideo = req.file;

    // Create directories if they don't exist
    const tempDir = path.join(__dirname, '../uploads/temp');
    const outputDir = path.join(__dirname, '../uploads/processed');
    [tempDir, outputDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    const inputPath = path.join(tempDir, `input-${Date.now()}-${inputVideo.originalname}`);
    fs.writeFileSync(inputPath, inputVideo.buffer);

    // Parse numeric values from request body
    const {
      cropX = 0,
      cropY = 0,
      cropWidth,
      cropHeight,
      padTop = 0,
      padRight = 0,
      padBottom = 0,
      padLeft = 0,
      padColor = 'black'
    } = req.body;

    const outputFileName = `processed-${Date.now()}.mp4`;
    const outputPath = path.join(outputDir, outputFileName);

    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath)
        // Add input options to handle potentially corrupt input
        .inputOptions(['-ignore_unknown'])
        // Add output options for better compatibility
        .outputOptions([
          '-c:v libx264',        // Use H.264 codec
          '-preset medium',      // Balance between speed and quality
          '-movflags +faststart', // Enable fast start for web playback
          '-pix_fmt yuv420p'     // Use widely supported pixel format
        ]);

      // Apply cropping if dimensions are provided
      if (cropWidth && cropHeight) {
        command = command.videoFilters([
          `crop=${cropWidth}:${cropHeight}:${cropX}:${cropY}`
        ]);
      }

      // Apply padding if any padding value is non-zero
      if (padTop || padRight || padBottom || padLeft) {
        command = command.videoFilters([
          `pad=width=in_w+${padLeft}+${padRight}:height=in_h+${padTop}+${padBottom}:x=${padLeft}:y=${padTop}:color=${padColor}`
        ]);
      }

      command
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('FFmpeg command:', commandLine);
        })
        .on('end', () => {
          // Verify the output file exists and has size > 0
          if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
            res.json({
              success: true,
              message: 'Video processed successfully',
              videoUrl: `/uploads/processed/${outputFileName}`
            });
            // Clean up input file after successful processing
            fs.unlinkSync(inputPath);
            resolve();
          } else {
            throw new Error('Output file is empty or does not exist');
          }
        })
        .on('error', (err) => {
          console.error('FFmpeg error:', err);
          // Clean up any temporary files
          [inputPath, outputPath].forEach(file => {
            if (fs.existsSync(file)) {
              fs.unlinkSync(file);
            }
          });
          res.status(500).json({
            error: 'Error processing video',
            details: err.message
          });
          reject(err);
        })
        .run();
    });
  } catch (error) {
    console.error('Processing error:', error);
    res.status(500).json({
      error: 'Server error',
      details: error.message
    });
  }
};

module.exports = {
  cropVideo
};
