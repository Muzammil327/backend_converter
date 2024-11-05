const express = require('express');
const { convertImage } = require('../controller/image/converterController.js');
const { convertImageResize } = require('../controller/image/resizeController.js');

const router = express.Router();

router.post('/image', convertImage);
router.post('/resizeimage', convertImageResize);

module.exports = router;
