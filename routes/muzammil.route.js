const express = require('express');
const { Audio } = require('../controller/format-conversion/contoller');
const { ResolutionScaling, BitrateControl, FormatCompatibility } = require('../controller/vedio/contoller');
const { mixAudio, noiseReductionController, convertChannelControl, convertAudioExtractor, convertVolumeAdjustment, removeSilence } = require('../controller/audio/contoller');
const { filterVideo, textOverlay, subtitles } = require('../controller/edit/controller');

const router = express.Router();

// Basic Format Conversion
router.post('/audio', Audio);

// Video Processing
router.post('/vedio/resolutionscaling', ResolutionScaling);
router.post('/vedio/bitratecontrol', BitrateControl);
router.post('/vedio/formatcompatibility', FormatCompatibility);

// audio
router.post('/audio/mixaudio', mixAudio);
router.post('/audio/noise-reduction', noiseReductionController);
router.post('/audio/channelcontrol', convertChannelControl);
router.post('/audio/extractor', convertAudioExtractor);
router.post('/audio/voladjustment', convertVolumeAdjustment);
router.post('/audio/slienceremover', removeSilence);

// edit
router.post('/edit/filtervedio', filterVideo);
router.post('/edit/textoverlay', textOverlay);
router.post('/edit/subtitles', subtitles);

module.exports = router;
