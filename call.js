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
let callButton
let hangUpButton
let socket
let ua
let session
let stream
let displayStateController
let holdButton
let unHoldButton
let muteButton
let unMuteButton
let referButton


function initial() {
    // заполнение справочника элементов
    soundsControl = document.querySelector("#sounds")
    remoteAudioControl = document.querySelector("#remoteAudio")
    loginInput = $("#loginText")
    passwordInput = $("#passwordText")
    loginButton = $("#loginButton")
    callNumberInput = $("#callNumberText")
    logOutButton = $("#logOutButton")
    callButton = $('#callNumberButton')
    answerButton = $('#answerButton')
    hangUpButton = $('#hangUpButton')
    holdButton = $('#holdButton')
    unHoldButton = $('#unHoldButton')
    muteButton = $('#muteButton')
    unMuteButton = $('#unMuteButton')
    referButton = $('#referButton')


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
    holdButton.click(hold)
    unHoldButton.click(unhold)
    muteButton.click(mute)
    unMuteButton.click(unmute)
    referButton.click(refer)

    // подготовка отображения к работе
    displayStateController = new DisplayStateController()
    displayStateController.setState(displayStateController.logoutState)
}


class DisplayStateController {
    logoutState = new LogoutState(this)
    waitState = new WaitState(this)
    registerState = new RegisterState(this)
    outGoingCallProgressState = new OutGoingCallProgressState(this)
    incomingCallProgressState = new IncomingCallProgressState(this)
    callAcceptedState = new CallAcceptedState(this)
    callHoldState = new CallHoldState(this)
    callMuteState = new CallMuteState(this)
    callEndedState = new CallEndedState(this)
    state

    constructor() {
        [
            loginInput,
            passwordInput,
            loginButton,
            callNumberInput,
            logOutButton,
            callButton,
            answerButton,
            hangUpButton,
            holdButton,
            unHoldButton,
            muteButton,
            unMuteButton,
            referButton,
        ].forEach(item => item.hide())
    }

    setState(state) {
        if (this.state) this.state.deactivate()
        this.state = state
        this.state.activate()
    }
}


class DisplayState {
    displayItems

    constructor(controller) {
        this.constructor = controller
    }

    activate() {
        this.displayItems.forEach(item => {
            item.show()
        })
    }

    deactivate() {
        this.displayItems.forEach(item => {
            item.hide()
        })
    }
}


class LogoutState extends DisplayState {
    displayItems = [loginInput, passwordInput, loginButton]
}


class WaitState extends DisplayState {

}


class RegisterState extends DisplayState {
    displayItems = [logOutButton, callNumberInput, callButton]
}


class OutGoingCallProgressState extends DisplayState {
    displayItems = [logOutButton, callNumberInput, hangUpButton]
}


class CallAcceptedState extends DisplayState {
    displayItems = [logOutButton, callNumberInput, hangUpButton, holdButton, muteButton, referButton]
}


class CallHoldState extends DisplayState {
    displayItems = [logOutButton, callNumberInput, hangUpButton, unHoldButton, referButton]
}


class CallMuteState extends DisplayState {
    displayItems = [logOutButton, callNumberInput, hangUpButton, unMuteButton, referButton]
}


class IncomingCallProgressState extends DisplayState {
    displayItems = [logOutButton, callNumberInput, answerButton, hangUpButton]
}


class CallEndedState extends DisplayState {
    displayItems = [logOutButton, callNumberInput, callButton ]
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

    ua.on('registered', () => displayStateController.setState(displayStateController.registerState))
    ua.on('unregistered', () => displayStateController.setState(displayStateController.logoutState))
    ua.on('newRTCSession', dispatchCall)
}


function logout() {
    ua.stop()
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
    session.on('hold', () => displayStateController.setState(displayStateController.callHoldState))
    session.on('unhold', () => displayStateController.setState(displayStateController.callAcceptedState))
    session.on('muted', () => displayStateController.setState(displayStateController.callMuteState))
    session.on('unmuted', () => displayStateController.setState(displayStateController.callAcceptedState))
    // session.on('refer', (e) => {
    //     console.log('------------------refer---------------------')
    //     console.log(e)
    //
    // })
    // session.on('reinvite', (e) => {
    //     console.log('------------------reinvite---------------------')
    //     console.log(e)
    //     // displayStateController.setState(displayStateController.registerState)
    // })
    // session.on('replaces', (e) => {
    //     console.log('------------------replaces---------------------')
    //     console.log(e)
    //     // displayStateController.setState(displayStateController.registerState)
    // })
}


function answer() {
    session.answer({
        mediaConstraints: {
            audio: true,
            video: false
        }
    })
}


function incomeCall(data) {
    session.on('progress', () => {
        displayStateController.setState(displayStateController.incomingCallProgressState)
        playSound("ringing.ogg", true)
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
        displayStateController.setState(displayStateController.callAcceptedState)
    })
    session.on('failed', () => {
        stopSound("ringing.ogg")
        playSound("rejected.mp3", false)
        displayStateController.setState(displayStateController.registerState)
    })
    session.on('ended', () => {
        displayStateController.setState(displayStateController.callEndedState)
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
        displayStateController.setState(displayStateController.outGoingCallProgressState)
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
        displayStateController.setState(displayStateController.callAcceptedState)
        stopSound("ringback.ogg")
    })
    session.on('failed', () => {
        stopSound("ringback.ogg")
        playSound("rejected.mp3", false)
        displayStateController.setState(displayStateController.registerState)
    })
    session.on('ended', () => {
        displayStateController.setState(displayStateController.callEndedState)
    })
}


function hangUp() {
    session.terminate()
}

function hold() {
    session.hold()
}

function unhold() {
    session.unhold()
}

function mute() {
    session.mute()
}

function unmute() {
    session.unmute()
}

function refer() {
    session.refer(callNumberInput.val())
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
