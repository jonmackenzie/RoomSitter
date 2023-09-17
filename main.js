const audioContext = new AudioContext();

function loadAudio(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = event => {
            audioContext.decodeAudioData(event.target.result, resolve, reject);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

let inputBuffer, roomBuffer;

document.getElementById('impulseResponseInput').addEventListener('change', (event) => {
    const file = event.target.files[0];
    loadAudio(file)
        .then(buffer => {
            roomBuffer = buffer;
            console.log('Impulse response loaded.');
        })
        .catch(error => alert(`Error loading sound file:\n${error}`));
});

document.getElementById('audioInput').addEventListener('change', (event) => {
    const file = event.target.files[0];
    loadAudio(file)
        .then(buffer => {
            inputBuffer = buffer;
            console.log('Sound file loaded.');
        })
        .catch(error => alert(`Error loading sound file:\n${error}`));
});

const progressText = document.getElementById('progresstext');

let processing = false;

document.getElementById('sit').addEventListener('click', async () => {
    if (processing) {
        return alert('please wait for the current process to finish before starting another');
    }

    processing = true;

    try {
        if (!inputBuffer) {
            return alert('No input file loaded!');
        }
        if (!roomBuffer) {
            return alert('No IR file loaded!');
        }

        const iterations   = +document.getElementById('iterations').value;
        const iterationGap = +document.getElementById('gap').value;
        const mode         = document.getElementById('mode').value;

        const roomSitter = new RoomSitter({
            inputBuffer,
            roomBuffer,
            iterations,
            iterationGap,
            mode,
        });

        roomSitter.setEquipmentParams(getEquipmentParams());

        if (document.getElementById('prepro').checked) {
            await roomSitter.preprocessInput();
        }

        const outputBufferPromise = roomSitter.sitInARoom();

        const interval = setInterval(() => {
            const {
                iterations, remainingIterations, samplesProcessed, samplesToProcess
            } = roomSitter.getProgress();

            const percentage = Math.floor((samplesProcessed / samplesToProcess) * 100) + '%';

            progressText.innerHTML = `${percentage} (${iterations - remainingIterations} iterations complete)`;
        }, 500);

        const outputBuffer = await outputBufferPromise;

        clearInterval(interval);

        downloadBufferAsWav(outputBuffer, 'output.wav');

        progressText.innerHTML = '';
    }
    catch (e) {
        console.error(e);
        alert(`ERROR:\n${e}`);
    }

    processing = false;
});

const tldrButton = document.getElementById('tldr');

tldrButton.addEventListener('click', async () => {
    const blah = document.getElementById('blahblahblah');

    blah.hidden = !blah.hidden;

    tldrButton.innerHTML = blah.hidden ? 'wait what did that say again?' : 'yeah whatever i\'m not reading all that';
});

function getEquipmentParams() {
    const fieldMap = {
        inputgain       : 'inputGain',
        outputgain      : 'outputGain',
        hpfcutoff       : 'highpassCutoff',
        lpfcutoff_sqrt  : 'lowpassCutoff',
        lshelffreq      : 'lowShelfFrequency',
        qwerty          : 'lshelfgain',
        hshelffreq_sqrt : 'highShelfFrequency',
        hshelfgain      : 'highShelfGain',
        compatt_exp     : 'compAttack',
        comprel_exp     : 'compRelease',
        compratio       : 'compRatio',
        compthreshold   : 'compThreshold',
        limatt_exp      : 'limiterAttack',
        limrel_exp      : 'limiterRelease',
        limratio        : 'limiterRatio',
        limthreshold    : 'limiterThreshold',
        wowfreq         : 'wowFrequency',
        wowvar          : 'wowVariation',
        wowdepth        : 'wowDepth',
        flutterfreq     : 'flutterFrequency',
        fluttervar      : 'flutterVariation',
        flutterdepth    : 'flutterDepth',
    };

    const params = {};

    for (const ctl of document.getElementsByClassName('advctl')) {
        let value = ctl.value;

        if (ctl.id.endsWith('_sqrt')) {
            value = value ** 2;
        }
        else if (ctl.id.endsWith('_exp')) {
            value = 10 ** value;
        }

        params[fieldMap[ctl.id]] = value;
    }

    return params;
}
