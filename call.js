$(document).ready(() => initial())

const SERVER = '10.88.0.70'
const PORT = '8089'
const loginAlias = 'login'
const passwordAlias = 'pwd'
const callNumberAlias = 'callNumber'
let soundsControl
let remoteAudioControl
let loginInput
let passwordInput
let loginButton
let callNumberInput
let answerButton
let logOutButton
let callPanel
let callButton
let hangUpButton
let socket
let ua
let session
let stream


function initial() {
    // заполнение справочника элементов
    soundsControl = document.querySelector("#sounds")
    remoteAudioControl = document.querySelector("#remoteAudio")
    loginInput = $("#loginText")
    passwordInput = $("#passwordText")
    loginButton = $("#loginButton")
    callNumberInput = $("#callNumberText")
    logOutButton = $("#logOutButton")
    callPanel = $("#callPanel")
    callButton = $('#callNumberButton')
    answerButton = $('#answerButton')
    hangUpButton = $('#hangUpButton')

    // если в локальном хранилище есть данные прошлых сессий, производим автозаполнение
    loginInput.val(localStorage.getItem(loginAlias))
    passwordInput.val(localStorage.getItem(passwordAlias))
    callNumberInput.val(localStorage.getItem(callNumberAlias))

    // добавляем события на кнопки
    loginButton.click(login)
    logOutButton.click(logout)
    callButton.click(call)
    hangUpButton.click(hangUp)
    answerButton.click(answer)

    // подготовка отображения к работе
    logoutSuccess()
}


function login() {
    localStorage.setItem(loginAlias, loginInput.val())
    localStorage.setItem(passwordAlias, passwordInput.val())

    socket = new JsSIP.WebSocketInterface(`wss://${SERVER}:${PORT}/ws`)
    ua = new JsSIP.UA(
        {
            uri: `sip:${loginInput.val()}@${SERVER}`,
            password: passwordInput.val(),
            display_name: loginInput.val(),
            sockets: [socket]
        })
    ua.start()

    ua.on('registered', loginSuccess)
    ua.on('unregistered', logoutSuccess)
    ua.on('registrationFailed', loginFail)
    ua.on('newRTCSession', dispatchCall)
}


function logout() {
    ua.stop()
}


function loginSuccess() {
    loginButton.hide()
    logOutButton.show()
    loginInput.attr('disabled', true)
    passwordInput.attr('disabled', true)
    callPanel.show()
    answerButton.hide()
    hangUpButton.hide()
}


function loginFail(data) {
    console.error("UA registrationFailed", data.cause)
}


function logoutSuccess() {
    loginButton.show()
    logOutButton.hide()
    loginInput.attr('disabled', false)
    passwordInput.attr('disabled', false)
    callPanel.hide()
}


function callStart() {
    callButton.hide()
    hangUpButton.show()
}


function callEnd() {
    hangUpButton.hide()
    callButton.show()
    answerButton.hide()

}


function incomingCall() {
    callButton.hide()
    answerButton.show()
    hangUpButton.show()
}


function call() {
    ua.call(callNumberInput.val(), {
        pcConfig:
            {
                hackStripTcp: true, // Важно для хрома, чтоб он не тупил при звонке
                rtcpMuxPolicy: 'negotiate', // Важно для хрома, чтоб работал multiplexing. Эту штуку обязательно нужно включить на астере.
                iceServers: []
            },
        mediaConstraints:
            {
                audio: true, // Поддерживаем только аудио
                video: false
            },
        rtcOfferConstraints:
            {
                offerToReceiveAudio: 1, // Принимаем только аудио
                offerToReceiveVideo: 0
            }
    })
}


function dispatchCall(data) {
    callStart()
    localStorage.setItem(callNumberAlias, callNumberInput.val())
    session = data.session
    switch (data.originator) {
        case 'remote':
            incomeCall(data)
            break
        case 'local':
            outgoingCall(data)
            break
    }
}


function incomeCall(data) {
    session.on('progress', () => {
        playSound("ringing.ogg", true)
        incomingCall()
    })
    session.on('connecting', () => {
        let reseivers = session.connection.getReceivers()
        stream = new MediaStream()
        reseivers.forEach(r => stream.addTrack(r.track))
        remoteAudioControl.srcObject = stream
        remoteAudioControl.play()
    })
    session.on('accepted', () => {
        stopSound("ringing.ogg")
        answerButton.hide()
    })
    session.on('failed', () => {
        stopSound("ringing.ogg")
        playSound("rejected.mp3", false)
        callEnd()
    })
    session.on('ended', callEnd)
}


function answer() {
    session.answer({
        mediaConstraints: {
            audio: true,
            video: false
        }
    })
}


function outgoingCall(data) {
    // // сразу
    // session.on('connecting', () => {console.log('---------------connecting-------------------')})
    // // звонок пошел
    // session.on('progress', () => {console.log('---------------progress-------------------')})
    // // после того, как принял звонок
    // session.on('accepted', () => {console.log('---------------accepted-------------------')})
    // session.on('confirmed', () => {console.log('---------------confirmed-------------------')})
    // // после того, как нажал завершить
    // session.on('ended', () => {console.log('---------------ended-------------------')})


    session.on('connecting', () => {
        stream = new MediaStream()
        session.connection.addEventListener('track', (e) => {
            stream.addTrack(e.track)
            remoteAudioControl.srcObject = stream
            remoteAudioControl.play()
        })
    })
    session.on('progress', () => {
        playSound("ringback.ogg", true)
    })
    session.on('accepted', () => {
        stopSound("ringback.ogg")
    })
    session.on('failed', () => {
        stopSound("ringback.ogg")
        playSound("rejected.mp3", false)
        callEnd()
    })
    session.on('ended', callEnd)
}


function hangUp() {
    session.terminate()
}


function playSound(soundName, loop) {
    soundsControl.pause()
    soundsControl.currentTime = 0.0
    soundsControl.src = "sounds/" + soundName
    soundsControl.loop = loop;
    soundsControl.play()
}


function stopSound() {
    soundsControl.pause()
    soundsControl.currentTime = 0.0
}
