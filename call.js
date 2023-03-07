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
let ua
let sessions
let session
let stream
let displayStateController
let holdButton
let unHoldButton
let muteButton
let unMuteButton
let referButton
let callNumberAddButton


class Session {
    session
    sessionNode

    constructor(session, sessionNode) {
        this.session = session
        this.sessionNode = sessionNode
    }
}


// хранилище экземпляров Session
class SessionStorage {
    sessions = []

    addSession(session) {
        this.sessions.push(session)
    }
    removeSession(ind) {
        this.sessions.splice(ind, 1)
    }
    getIndSession(session) {
        this.sessions.indexOf(session)
    }
    getAllSessions() {
        return this.sessions
    }
}


class SessionController {
    sessionStorage
    nodeController

    constructor(
        sessionStorage= new SessionStorage(),
        nodeController = new NodeController()
    ) {
        this.sessionStorage = sessionStorage
        this.nodeController = nodeController
    }

    incomingSessionHandle(session) {
        this.sessionStorage.addSession()
        this.nodeController.addSessionNode()

    }

    outGoingSessionHandle(session) {

    }
}


class NodeCreator {
    createSessionNode(session) {

    }
}


class NodeController {
    nodeCreator

    constructor(nodeCreator=new NodeCreator()) {
        this.nodeCreator = nodeCreator
    }

    addSessionNode(session) {
        let sessionNode = this.nodeCreator.createSessionNode(session)
        // добавить ее на страницу
    }
}


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
    callNumberAddButton = $('#callNumberAddButton')


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
    callNumberAddButton.click(callAdd)

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
            callNumberAddButton,
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
    displayItems = [logOutButton, callNumberInput, callButton, hangUpButton, holdButton, muteButton, referButton, callNumberAddButton]
}


class CallHoldState extends DisplayState {
    displayItems = [logOutButton, callNumberInput, hangUpButton, unHoldButton, referButton, callNumberAddButton]
}


class CallMuteState extends DisplayState {
    displayItems = [logOutButton, callNumberInput, hangUpButton, unMuteButton, referButton, callNumberAddButton]
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

    let serverUrl = `wss://${SERVER}:${PORT}/ws`
    let localURI = `sip:${loginInput.val()}@${SERVER}`

    let socket = new JsSIP.WebSocketInterface(serverUrl)

    ua = new JsSIP.UA({
        uri: localURI,
        password: passwordInput.val(),
        display_name: loginInput.val(),
        sockets: [socket]
    })

    ua.start()

    ua.on('registered', () => {
        sessions = new SessionStorage()
        displayStateController.setState(displayStateController.registerState)
    })
    ua.on('unregistered', () => {
        sessions = null
        displayStateController.setState(displayStateController.logoutState)
    })
    ua.on('newRTCSession', dispatchCall)
}


function logout() {
    ua.stop()
    ua = null
}


function call() {
    options = {
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
            },
    }

    ua.call(callNumberInput.val(), options)
}


function callAdd() {
    options = {
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
            },
        mediaStream: remoteAudioControl.srcObject
    }

    ua.call(callNumberInput.val(), options)
}


function dispatchCall(data) {
    session.addSession(data.session)

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
    session.on('reinvite', () => console.log('---------------------reinvite----------------------'))
    session.on('refer', () => console.log('---------------------refer----------------------'))
    session.on('replaces', () => console.log('---------------------refer----------------------'))


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
        console.log(session)
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
    let options = {
        eventHandlers: {
            'requestSucceeded': () => console.log('-------------------requestSucceeded--------------------'),
            'requestFailed': () => console.log('-------------------requestFailed--------------------'),
            'trying': () => console.log('-------------------trying--------------------'),
            'progress': () => console.log('-------------------progress--------------------'),
            'accepted': () => console.log('-------------------accepted--------------------'),
        }
    }
    session.refer(callNumberInput.val(), options)
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
