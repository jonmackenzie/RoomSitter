// all of these functions were written by chatgpt lol, i just collapsed "downloadWav"
// and "createWavBlob" into one "downloadBufferAsWav"

function downloadBufferAsWav(buffer, filename) {
    const wavBuffer = createWavBuffer(buffer);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    document.body.appendChild(a);
    a.style = 'display: none';
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function createWavBuffer(buffer) {
    const interleaved = interleaveChannels(buffer.getChannelData(0), buffer.getChannelData(1));
    const wavData = createWaveFileData(interleaved, buffer.sampleRate);
    return new Uint8Array(wavData).buffer;
}

function interleaveChannels(leftChannel, rightChannel) {
    const length = leftChannel.length + rightChannel.length;
    const result = new Float32Array(length);

    let inputIndex = 0;
    for (let outputIndex = 0; outputIndex < length;) {
        result[outputIndex++] = leftChannel[inputIndex];
        result[outputIndex++] = rightChannel[inputIndex];
        inputIndex++;
    }

    return result;
}

function createWaveFileData(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // RIFF identifier 'RIFF'
    writeString(view, 0, 'RIFF');
    // file length minus RIFF identifier length and file description length
    view.setUint32(4, 32 + samples.length * 2, true);
    // RIFF type 'WAVE'
    writeString(view, 8, 'WAVE');
    // format chunk identifier 'fmt '
    writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (raw)
    view.setUint16(20, 1, true);
    // channel count
    view.setUint16(22, 2, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * 4, true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, 4, true);
    // bits per sample
    view.setUint16(34, 16, true);
    // data chunk identifier 'data'
    writeString(view, 36, 'data');
    // data chunk length
    view.setUint32(40, samples.length * 2, true);

    floatTo16BitPCM(view, 44, samples);

    return buffer;
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

function floatTo16BitPCM(output, offset, input) {
    for (let i = 0; i < input.length; i++, offset += 2) {
        const sample = Math.max(-1, Math.min(1, input[i]));
        output.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
}