function createEquipment(audioContext, {
    inputGain          = 0.65,
    highpassCutoff     = 35,
    lowpassCutoff      = 15000,
    lowShelfFrequency  = 120,
    lowShelfGain       = -1,
    highShelfFrequency = 5500,
    highShelfGain      = -1,
    compAttack         = 0.01,
    compRelease        = 0.35,
    compRatio          = 8,
    compThreshold      = -8,
    compKnee           = 2,
    limiterAttack      = 0.001,
    limiterRelease     = 0.2,
    limiterRatio       = 18,
    limiterThreshold   = -4,
    limiterKnee        = 0,
    outputGain         = 0.9,
    wowFrequency       = 0.5,
    wowVariation       = 0.1,
    wowDepth           = 0.1,
    flutterFrequency   = 12,
    flutterVariation   = 1,
    flutterDepth       = 0.005
}) {
    const inputGainNode = new GainNode(audioContext, { gain : inputGain });

    const highPassNode = new BiquadFilterNode(audioContext, {
        type : 'highpass',
        frequency : highpassCutoff
    });

    const lowPassNode = new BiquadFilterNode(audioContext, {
        type : 'lowpass',
        frequency : lowpassCutoff
    });

    const lowShelfNode = new BiquadFilterNode(audioContext, {
        type : 'lowshelf',
        frequency : lowShelfFrequency,
        gain : lowShelfGain
    });

    const highShelfNode = new BiquadFilterNode(audioContext, {
        type : 'highshelf',
        frequency : highShelfFrequency,
        gain : highShelfGain
    });

    const compressorNode = new DynamicsCompressorNode(audioContext, {
        attack : compAttack,
        release : compRelease,
        ratio : compRatio,
        threshold : compThreshold,
        knee : compKnee
    });

    const limiterNode = new DynamicsCompressorNode(audioContext, {
        attack : limiterAttack,
        release : limiterRelease,
        ratio : limiterRatio,
        threshold : limiterThreshold,
        knee : limiterKnee
    });

    const outputGainNode = new GainNode(audioContext, { gain : outputGain });

    const wow = new OscillatorNode(audioContext, {
        frequency : wowFrequency - wowVariation + (2 * wowVariation * Math.random()),
        type : 'sine'
    });

    const wowGain = new GainNode(audioContext, { gain : wowDepth });

    const flutter = new OscillatorNode(audioContext, {
        frequency : flutterFrequency - flutterVariation + (2 * flutterVariation * Math.random()),
        type : 'sine'
    });

    const flutterGain = new GainNode(audioContext, { gain : flutterDepth });

    const vibrato = new DelayNode(audioContext, {
        delayTime : 0.01,
        maxDelayTime : 0.05
    });

    const totalVibratoGain = new GainNode(audioContext, { gain : 0.01 });

    wow.start(0);
    flutter.start(0);

    wow.connect(wowGain);
    flutter.connect(flutterGain);
    wowGain.connect(totalVibratoGain);
    flutterGain.connect(totalVibratoGain);
    totalVibratoGain.connect(vibrato.delayTime);

    inputGainNode.connect(highPassNode);
    highPassNode.connect(lowPassNode);
    lowPassNode.connect(lowShelfNode);
    lowShelfNode.connect(highShelfNode);
    highShelfNode.connect(vibrato);
    vibrato.connect(compressorNode);
    compressorNode.connect(limiterNode);
    limiterNode.connect(outputGainNode);

    return { inputNode : inputGainNode, outputNode : outputGainNode };
}


function concatBuffers(buffers, gap = 0, tail = 0) {
    // TODO error handling
    if (!buffers?.length) {
        return null;
    }

    // Assume all buffers have same sample rate
    const sampleRate = buffers[0].sampleRate;

    const gapSamples  = Math.ceil(gap * sampleRate);
    const tailSamples = Math.ceil(tail * sampleRate);

    const length = buffers.reduce((a, b) => a + b.length, 0) + buffers.length * gapSamples + tailSamples;

    const numberOfChannels = Math.max(...buffers.map(b => b.numberOfChannels));

    const newBuffer = new AudioBuffer({ length, numberOfChannels, sampleRate});
    
    let start = 0;
    for (const thisBuffer of buffers) {
        for (let i = 0; i < numberOfChannels; i++) {
            newBuffer.getChannelData(i).set(thisBuffer.getChannelData(i % thisBuffer.numberOfChannels), start);
        }

        start += thisBuffer.length + gapSamples;
    }

    return newBuffer;
}


// triangular number
function tri(n) {
    return (n ** 2 + n) / 2;
}


class RoomSitter {
    sampleRate;
    initBuffer;
    tapeBuffer;
    roomBuffer;
    mode;
    iterations;
    remainingIterations;
    iterationGap;
    batchSize; // TODO add support for batch size
    samplesToProcess;
    samplesProcessed;

    equipmentParams = {};

    static MODES = {
        SINGLE     : 'single',
        DISCRETE   : 'discrete',
        CONTINUOUS : 'continuous',
    };


    constructor({
        inputBuffer,
        roomBuffer,
        mode         = RoomSitter.MODES.DISCRETE,
        iterations   = 1,
        iterationGap = 1,
    }) {
        // TODO better error handling...
        if (inputBuffer.sampleRate != roomBuffer.sampleRate) {
            throw 'SAMPLE_RATE_MISMATCH';
        }

        this.sampleRate = inputBuffer.sampleRate;

        // TODO optionally pre-process init buffer with "recording equipment"
        this.initBuffer = inputBuffer;
        this.tapeBuffer = inputBuffer;
        this.roomBuffer = roomBuffer;

        this.mode                = mode;
        this.iterationGap        = iterationGap;
        this.iterations          = iterations;
        this.remainingIterations = iterations;

        let samplesToProcess = tri(iterations) * roomBuffer.length;

        if (mode == RoomSitter.MODES.CONTINUOUS) {
            samplesToProcess += tri(iterations) * inputBuffer.length;
        }
        else {
            samplesToProcess += iterations * inputBuffer.length;
        }
    
        this.samplesToProcess = samplesToProcess;
        this.samplesProcessed = 0;
    }


    setEquipmentParams(values) {
        Object.assign(this.equipmentParams, values);
    }


    getProgress() {
        return {
            iterations          : this.iterations,
            remainingIterations : this.remainingIterations,
            samplesToProcess    : this.samplesToProcess,
            samplesProcessed    : this.samplesProcessed,
        };
    }


    async preprocessInput() {
        const audioContext = new OfflineAudioContext(2, this.initBuffer.length, this.initBuffer.sampleRate);

        const source = new AudioBufferSourceNode(audioContext, { buffer : this.initBuffer });

        const equipment = createEquipment(audioContext, this.equipmentParams);

        source.connect(equipment.inputNode);

        equipment.outputNode.connect(audioContext.destination);

        // Begin tape playback and rendering
        source.start(0);
        this.initBuffer = await audioContext.startRendering();
        this.tapeBuffer = this.initBuffer;;
    }


    async iterate() {
        const totalLength = Math.ceil(this.tapeBuffer.length + this.roomBuffer.length);

        const audioContext = new OfflineAudioContext(2, totalLength, this.tapeBuffer.sampleRate);

        const source = new AudioBufferSourceNode(audioContext, { buffer : this.tapeBuffer });

        const equipment = createEquipment(audioContext, this.equipmentParams);

        const convolver = new ConvolverNode(audioContext, { buffer : this.roomBuffer });

        source.connect(convolver);

        convolver.connect(equipment.inputNode);

        equipment.outputNode.connect(audioContext.destination);

        // Begin tape playback and rendering
        source.start(0);
        this.tapeBuffer = await audioContext.startRendering();

        this.samplesProcessed += totalLength;
    }


    async sitInARoom() {
        // Only used in discrete mode
        let outputBuffer = this.tapeBuffer;

        while (this.remainingIterations) {
            await this.iterate();

            if (this.mode == RoomSitter.MODES.CONTINUOUS) {
                this.tapeBuffer = concatBuffers([this.initBuffer, this.tapeBuffer], this.iterationGap);
            }
            else if (this.mode == RoomSitter.MODES.DISCRETE) {
                outputBuffer = concatBuffers([outputBuffer, this.tapeBuffer], this.iterationGap);
            }

            this.remainingIterations--;
        }

        return this.mode == RoomSitter.MODES.DISCRETE ? outputBuffer : this.tapeBuffer;
    }
}