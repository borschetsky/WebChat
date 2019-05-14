import React, {Component } from 'react';
import Axios from 'axios';
import { withAuth } from './hoc';
import * as signalR from '@aspnet/signalr';
import MessageList from './MessageList';
import SendMessageForm from './send-message-form';
import UserList from './UserList';
import OponentProfile from './oponent-profile'
import MyProfile from './my-profile';

class Dashboard extends Component  {
//TODO: use only user profile with props needed
    constructor(props){
        super(props);
        this.state = {
            userId: null,
            userProfile: null,
            userName: null,
            threadId: null,
            oponentId: null,
            oponentProfile:{},
            threads: [],
            message: '',
            messages: [],
            users: [],
            error: true,
            hubConnection: null,
            isEdit: false
        };
        this.connection = new signalR.HubConnectionBuilder().withUrl("http://localhost:5000/chat", {
            accessTokenFactory: () => this.props.user.token
        }).build();

    }
    
    componentDidMount(){
        const {token} = this.props.user;
        Axios.get('http://localhost:5000/api/users/getprofile', {
            headers: {'Authorization': `Bearer ${token}`,}
        }).then(res => this.setState({userProfile: res.data, userName: res.data.username})).catch(err => console.log(err));

        this.connection.start(() => console.log("started"))
        .catch(err => {
            console.log(err)
            this.props.history.push("/login");

        });
        this.connection.on('ReciveConnectionId', connId => {
            console.log(`CuurentConnectionId: ${connId}`);
        });
        this.setState({hubConnection: this.connection});
        this.update();
    };

    componentDidUpdate = (prevProps, prevState) => {
        if(prevState.threadId !== this.state.threadId){
            //Invoke get messages for thread
            const {threadId} = this.state;

            this.getMessagesForThread(threadId);
        }
        
    };

    getMessagesForThread = (threadId) => {
        const {token} = this.props.user;
            this.setState({messages: []});
            Axios.get(`http://localhost:5000/api/thread/getmessages/${threadId}`, {
                headers:{'Authorization': `Bearer ${token}`}
            }).then(res => {
                this.setState({messages: res.data});
            }).catch(err => console.log(err.response));

    };

   update = async () => {
        const {token} = this.props.user;
        //Getting user's threads
        await Axios.get('http://localhost:5000/api/hey/getthreads', {
            headers: {'Authorization': `Bearer ${token}`}
        }).then(res => {
            const { status } = res;
            if(status !== 204){
               console.log(res.data);
               const { data: threads} = res;
               this.setState({threads});
            };
        }).catch(err => console.log(err));

        this.connection.on('ReviceThread', (thread) => {
            console.log(thread);
            let {threads} = this.state;
            threads = [...threads, thread];
            this.setState({threads});
        });

        this.connection.on('ReciveAvatar', (avatar) => {
            const { userProfile, oponentProfile, threads } = this.state;
            if(avatar.uploaderId === userProfile.id){
                userProfile.avatarFileName = avatar.body.value;
            };
            if(avatar.uploaderId === oponentProfile.id){
                oponentProfile.avatarFileName = avatar.body.value;
            }
            threads.forEach(t => {
                if(t.oponentVM.id === avatar.uploaderId){
                    t.oponentVM.avatarFileName = avatar.body.value;
                }
            });
            this.setState({userProfile, oponentProfile, threads});
        });

        this.connection.on('ReciveMessage', (message) => {
            console.log(message);
            const { threads} = this.state;
            threads.forEach(t => {
                if(t.id === message.threadId){
                    t.lastMessage.text = message.text;
                    t.lastMessage.time = message.time;
                }
            });
            this.setState({threads});
            if(message.threadId !== this.state.threadId){
                return;
            }
            let {messages} = this.state;
            messages = [...messages, message];

            this.setState({messages: messages});
        });

        this.connection.on('ReciveConnectedStatus', (connectedUserId) => {
            const { threads } = this.state;
            threads.forEach(t => {
                if(t.oponentVM.id === connectedUserId){
                    t.oponentVM.isOnline = true;
                };
            });
            this.setState({threads});
        });

        this.connection.on('ReciveDisconnectedStatus', disconnectedUserId => {
            const { threads } = this.state;
            threads.forEach(t => {
                if(t.oponentVM.id === disconnectedUserId){
                    t.oponentVM.isOnline = false;
                };
            });
            this.setState({threads});
        });

    };
    //change oponent name to id
    createThread = (oponentVM) => {
        const {token} = this.props.user;
        const { id } = this.state.userProfile;
        var thread = this.state.threads.find(t => t.oponentVM.id === oponentVM.id || t.owner === oponentVM.id);
        if(!thread){
            Axios.post('http://localhost:5000/api/hey/createthread', {
                Owner: id,
                OponentVM: {Id: oponentVM.id, Username: oponentVM.username, AvatarFileName: oponentVM.avatarFileName}
            }, {
                headers:{
                    'Authorization': `Bearer ${token}`
                }
            }).then(res => {
                const{ threadId } = res.data;
                this.setState({threadId, oponentId: oponentVM.id, oponentProfile: oponentVM});
            })
            .catch(err => {
                console.log(err.response.data.threadId);
                const { threadId } = err.response.data;
                this.setState({threadId, oponentId: oponentVM.id, oponentProfile: oponentVM});
            });    
        }else{
            this.setState({threadId: thread.id, oponentId: oponentVM.id, oponentProfile: oponentVM});
        };
       
    };

    sendMessage = (message) => {
        const {token} = this.props.user;
        if(!this.state.threadId){
            console.log("Thread isn't choosen");
            return;
        }
        Axios.post('http://localhost:5000/api/hey/send', {
            SenderId: this.props.user.id,
            Text: message,
            ThreadId: this.state.threadId,
            Username: this.state.userName
        }, {
            headers:{
                'Authorization': `Bearer ${token}`
            }
        }).then(res => {
            if(res.status === 201){
                console.log("Message succesfully been sent");
                
            }
        }).catch(err => {
            console.log(err.response.data);
        });    
    };

    subscribeToThread = (threadId, oponentVm) => {
        this.setState({threadId, oponentId: oponentVm.id, oponentProfile: oponentVm});
    };

    handleLogOut = () => {
        localStorage.removeItem('user-data');
        this.props.history.push('/Login');
    };
    handleEditorClose = () => {
        this.setState((state) => ({
            isEdit: !state.isEdit
        }));
    }

  render(){
   
    
    const { userProfile, oponentId, messages, threadId, userName, threads, isEdit, oponentProfile} = this.state;
   
    return(
        <div className="app">
           <MyProfile  handleLogOut={this.handleLogOut} profile={userProfile} handleEditorClose={this.handleEditorClose}/>
            <OponentProfile oponentId={oponentId} profile={oponentProfile}/>
            <MessageList messages={messages} threadId={threadId} username={userName}/>
            <SendMessageForm sendMessage={this.sendMessage}/>
            <UserList 
                profile={userProfile}
                threadId={threadId}
                threads={threads} 
                userId={this.props.user.id} 
                subscribeToThread={this.subscribeToThread}
                createThread={this.createThread}
                handleEditorClose={this.handleEditorClose}
                isEdit={isEdit}/>
        </div>
    );
  };
};

export default withAuth(Dashboard);