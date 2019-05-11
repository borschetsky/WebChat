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

    constructor(props){
        super(props);
        this.state = {
            userId: null,
            userProfile: null,
            userName: null,
            threadId: null,
            oponentId: null,
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

        await Axios.get('http://localhost:5000/api/hey/getthreads', {
            headers: {'Authorization': `Bearer ${token}`}
        }).then(res => {
            if(res.status !== 204){
               console.log(res.data);
               this.setState({threads: res.data});
            };
        }).catch(err => console.log(err));

        this.connection.on('ReviceThread', (thread) => {
            console.log(thread);
            let {threads} = this.state;
            threads = [...threads, thread];
            this.setState({threads});
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
            console.log(message);
            let {messages} = this.state;
            messages = [...messages, message];

            this.setState({messages: messages});
        });

        this.connection.on('ReciveClientStatus', (userId) => {
            var connectedUserName = this.state.users.find(u => u.id === userId).userName;
            console.log(connectedUserName);
        });
    };
    //change oponent name to id
    createThread = (oponentId) => {
        const {token} = this.props.user;
        console.log(oponentId);
        var thread = this.state.threads.find(t => t.oponent === oponentId || t.owner === oponentId);
        if(!thread){
            Axios.post('http://localhost:5000/api/hey/createthread', {
                Oponent: oponentId
            }, {
                headers:{
                    'Authorization': `Bearer ${token}`
                }
            }).then(res => {
                const{ threadId } = res.data;
                this.setState({threadId, oponentId: oponentId});
            })
            .catch(err => {
                console.log(err.response.data.threadId);
                const { threadId } = err.response.data;
                this.setState({threadId, oponentId: oponentId});
            });    
        }else{
            this.setState({threadId: thread.id, oponentId: oponentId});
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

    subscribeToThread = (threadId, oponentId) => {
        this.setState({threadId, oponentId: oponentId});
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
   
    
    const { userProfile, oponentId, messages, threadId, userName, threads, isEdit} = this.state;
   
    return(
        <div className="app">
           <MyProfile  handleLogOut={this.handleLogOut} profile={userProfile} handleEditorClose={this.handleEditorClose}/>
            <OponentProfile oponentId={oponentId}/>
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