import React, {Component } from 'react';
import Axios from 'axios';
import { withAuth } from './hoc';
import * as signalR from '@aspnet/signalr';
import RoomList from './RoomList';
import MessageList from './MessageList';
import SendMessageForm from './SendMessageForm';
import UserList from './UserList';

class Dashboard extends Component  {

    constructor(props){
        super(props);
        this.state = {
            userId: null,
            userName: null,
            threadId: null,
            threads: null,
            message: '',
            messages: [],
            users: null,
            error: true,
            hubConnection: null
        };
        this.connection = new signalR.HubConnectionBuilder().withUrl("http://localhost:5000/chat", {
            accessTokenFactory: () => this.props.user.token
        }).build();

    }
    
    componentDidMount(){
        const {token} = this.props.user;
        
        this.connection.start(() => console.log("started")).catch(err => console.log(err));
        
        this.update();
        
        // Axios.get('http://localhost:5000/api/hey/get', {
        //     headers: {'Authorization': `Bearer ${token}`},
        // }).then(res => this.setState({message: res.data.message, error: false}))
        // .catch(err => {
        //     if(!err.status){
        //         console.log(err);
        //         this.setState({error: true});
        //     }
        //     else{
        //         if(err.response.status === 401){
        //             this.props.history.push("/login");
        //         };
        //         if(err.response.status === 500){
        //             this.setState({error: true});
        //         };
        //     };
        // });
        Axios.get('http://localhost:5000/api/hey/getusername', {
            headers: {'Authorization': `Bearer ${token}`,}
        }).then(res => this.setState({userName : res.data, error: false})).then(() => console.log(`Your username is: ${this.state.userName}`));

        
    };

    componentDidUpdate = (prevProps,prevState) =>{
        if(prevState.threadId !== this.state.threadId){
            //Invoke get messages for thread
        }
    };

   getMessagesForThread = (threadId) => {
        this.setState({messages: []});

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
            if(message.threadId !== this.state.threadId){
                return;
            }
            console.log(message);
            let {messages} = this.state;
            messages = [...messages, message];

            this.setState({messages: messages});
        });




    };

    createThread = (oponent) => {
        const {token} = this.props.user;

        console.log(oponent);
        Axios.post('http://localhost:5000/api/hey/createthread', {
            Oponent: oponent
        }, {
            headers:{
                'Authorization': `Bearer ${token}`
            }
        }).catch(err => {
            console.log(err.response.data.threadId);
            const { threadId } = err.response.data;
            this.setState({threadId});
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
            if(res.status === 200){
                console.log("Message succesfully been sent");
            }
        }).catch(err => {
            console.log(err.response.data);
        });    
    };

    subscribeToThread = (threadId) => {
        console.log(`Thred been choosen with id: ${threadId}`);
        this.setState({threadId, messages: []});
    };

  render(){
    //   if(this.state.error){
    //       return <h2>Error!</h2>
    //   }
    
    return(
        <div className="app">
            <RoomList/>
            <MessageList messages={this.state.messages} threadId={this.state.threadId}/>
            <SendMessageForm sendMessage={this.sendMessage}/>
            <RoomList users={this.state.users} user={this.props.user.id} createThread={this.createThread}/>
            <UserList 
                threadId={this.state.threadId}
                threads={this.state.threads} 
                userId={this.props.user.id} 
                subscribeToThread={this.subscribeToThread}/>
        </div>
    );
  };
};

export default withAuth(Dashboard);