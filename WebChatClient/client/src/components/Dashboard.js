import React, {Component } from 'react';
import Axios from 'axios';
import { withAuth } from './hoc';
import * as signalR from '@aspnet/signalr';
import RoomList from './RoomList';
import MessageList from './MessageList';
import SendMessageForm from './send-message-form';
import UserList from './UserList';
import Test from './Test';
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
            oponentName: null,
            threads: [],
            message: '',
            messages: [],
            users: [],
            error: true,
            hubConnection: null
        };
        this.connection = new signalR.HubConnectionBuilder().withUrl("http://localhost:5000/chat", {
            accessTokenFactory: () => this.props.user.token
        }).build();

    }
    
    componentDidMount(){
        const {token} = this.props.user;
        Axios.get('http://localhost:5000/api/hey/getprofile', {
            headers: {'Authorization': `Bearer ${token}`,}
        }).then(res => this.setState({userProfile: res.data}));

        this.connection.start(() => console.log("started")).catch(err => console.log(err));
        this.connection.on('ReciveConnectionId', connId => {
            console.log(`CuurentConnectionId: ${connId}`);
        });
        this.update();
        
        Axios.get('http://localhost:5000/api/hey/getusername', {
            headers: {'Authorization': `Bearer ${token}`,}
        }).then(res => this.setState({userName : res.data, error: false})).then(() => console.log(`Your username is: ${this.state.userName}`));

        

        
    };

    componentDidUpdate = (prevProps,prevState) =>{
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
            console.log(res.data);
            this.setState({messages: res.data});
        });

   };

   update = async () => {
        const {token} = this.props.user;

        
        //get all registered users
        await Axios.get('http://localhost:5000/api/hey/getusers', {
            headers: {'Authorization': `Bearer ${token}`}
        }).then(res => this.setState({users: res.data})).then(() => console.log(this.state.users));
        //Get list of user's threads
        await Axios.get('http://localhost:5000/api/hey/getthreads', {
            headers: {'Authorization': `Bearer ${token}`}
        }).then(res => {
            if(res.status !== 204){
               console.log(res.data);
               this.setState({threads: res.data});
            };
        });

        this.connection.on('ReciveMessage', (message) => {
            console.log(message);
            const { threads} = this.state;
            threads.forEach(t => {
                if(t.id === message.threadId){
                    t.lastMessage = message.text;
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

    createThread = (oponentId, oponentUsername) => {
        const {token} = this.props.user;

        console.log(oponentId);
        Axios.post('http://localhost:5000/api/hey/createthread', {
            Oponent: oponentId
        }, {
            headers:{
                'Authorization': `Bearer ${token}`
            }
        }).then(res => {
            const{ threadId } = res.data;
            this.setState({threadId, oponentName: oponentUsername});
        })
        .catch(err => {
            console.log(err.response.data.threadId);
            const { threadId } = err.response.data;
            this.setState({threadId, oponentName: oponentUsername});
        });    
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

    subscribeToThread = (threadId, oponentName) => {
        console.log(oponentName);
        console.log(`Thred been choosen with id: ${threadId}`);
        this.setState({threadId, oponentName});
    };

    handleLogOut = () => {
        localStorage.removeItem('user-data');
        this.props.history.push('/Login');
    };


  render(){
   
    
    const { userProfile, oponentName, messages, threadId, userName, threads} = this.state;
    console.log(this.props.user.id);
    return(
        <div className="app">
           <MyProfile  handleLogOut={this.handleLogOut} profile={this.state.userProfile}/>
            <OponentProfile name={this.state.oponentName}/>
            <MessageList messages={this.state.messages} threadId={this.state.threadId} username={this.state.userName}/>
            <SendMessageForm sendMessage={this.sendMessage}/>
            {/* <RoomList users={this.state.users} user={this.props.user.id} createThread={this.createThread}/> */}
            <UserList 
                threadId={this.state.threadId}
                threads={this.state.threads} 
                userId={this.props.user.id} 
                subscribeToThread={this.subscribeToThread}
                users={this.state.users}
                createThread={this.createThread}/>
        </div>
    );
  };
};

export default withAuth(Dashboard);