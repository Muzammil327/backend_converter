const formidable = require('formidable');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const cloudinary = require('../../lib/cloudinaryConfig');

const Audio = (req, res) => {
  const form = new formidable.IncomingForm();

  form.parse(req, (err, fields, files) => {
      if (err) {
          return res.status(400).json({ error: 'Error parsing the file.' });
      }

      if (!files.audio || files.audio.length === 0) {
          return res.status(400).json({ error: 'No audio file uploaded.' });
      }

      const inputFile = files.audio[0].filepath;
      const outputFormat = fields.format ? fields.format[0] : 'mp3';
      const supportedFormats = ['mp3', 'wav', 'aac'];

      console.log("fields:", fields);
      console.log("fields format:", outputFormat);

      if (!supportedFormats.includes(outputFormat)) {
          return res.status(400).json({ error: 'Unsupported audio format requested.' });
      }

      // Ensure the temporary directory exists
      const tempDir = path.join(__dirname, '../tmp');
      if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir);
      }

      const outputFileName = `${Date.now()}.${outputFormat}`;
      const outputFile = path.join(tempDir, outputFileName);

      ffmpeg(inputFile)
          .toFormat(outputFormat)
          .on('end', async () => {
              try {
                  const result = await cloudinary.uploader.upload(outputFile, {
                      resource_type: 'auto',
                  });

                  res.status(200).json({ message: 'Conversion successful', url: result.secure_url });

                  fs.unlinkSync(inputFile);
                  fs.unlinkSync(outputFile);
              } catch (uploadError) {
                  console.error('Error uploading to Cloudinary:', uploadError);
                  res.status(500).json({ error: 'Failed to upload to Cloudinary.', details: uploadError });
              }
          })
          .on('error', (error) => {
              console.error('Error converting file:', error);
              res.status(500).json({ error: 'Failed to convert audio.' });
          })
          .save(outputFile);
  });
}

module.exports = { Audio };