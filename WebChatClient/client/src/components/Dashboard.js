import React, {Component } from 'react';
import Axios from 'axios';
import { withAuth } from './hoc';
import * as signalR from '@aspnet/signalr';
import RoomList from './RoomList';
import MessageList from './MessageList';
import SendMessageForm from './SendMessageForm';

class Dashboard extends Component  {

    constructor(props){
        super(props);
        this.state = {
            userId: null,
            userName: null,
            message: '',
            messages: [],
            error: true,
            hubConnection: null
        };
        this.connection = new signalR.HubConnectionBuilder().withUrl("http://localhost:5000/chat", {
            accessTokenFactory: () => this.props.user.token
        }).build();

    }
    
    componentDidMount(){
        const {token} = this.props.user;
        // const connection = new HubConnection('http://localhost:5000/chat');
        this.connection.start(() => console.log("started")).catch(err => console.log(err));
        
    //     this.setState({connection: this.connection});
       this.update();
        // this.state.hubConnection.on('SendMessage', (user, revivedMessage) => {
        //     const text = `${user}: ${revivedMessage}`;
        //     const messages = [...this.state.messages, text];
        //     this.setState({messages});
        // });
        Axios.get('http://localhost:5000/api/hey/get', {
            headers: {'Authorization': `Bearer ${token}`},
        }).then(res => this.setState({message: res.data.message, error: false}))
        .catch(err => {
            if(!err.status){
                console.log(err);
                this.setState({error: true});
            }
            else{
                if(err.response.status === 401){
                    this.props.history.push("/login");
                };
                if(err.response.status == 500){
                    this.setState({error: true});
                };
            };
        });
        Axios.get('http://localhost:5000/api/hey/getusername', {
            headers: {'Authorization': `Bearer ${token}`,}
        }).then(res => this.setState({userName : res.data, error: false})).then(() => console.log(this.state.userName));

        // this.state.hubConnection.on('SendMessage', (userName, recivedMessage) => {
        //     const text = `${userName}: ${recivedMessage}`;
        //     const messages = [...this.state.messages, text];
        //     this.setState({messages});
        // });
    };

    update = () => {
        const {token} = this.props.user;

        Axios.get('http://localhost:5000/api/hey/getmessages', {
            headers: {'Authorization': `Bearer ${token}`}
        }).then(res => this.setState({messages: res.data}));

        this.connection.on('SendMessage', (userName, recivedMessage, time) => {
            console.log(time);
            const msg = {
                username: userName,
                text: recivedMessage,
                time: time
            };
            const messages = this.state.messages;
            messages.push(msg);
            this.setState({messages: messages});
        });
    };

    sendMessage = (message) => {
        const {token} = this.props.user;
        console.log(token);

        Axios.post('http://localhost:5000/api/hey/send', {
            UserId: this.props.user.id,
            Text: message
        }, {
            headers:{
                'Authorization': `Bearer ${token}`
            }
        });
        // this.connection.invoke('SendMessage', this.state.userName, message).catch(err => console.log(err));
        // this.setState({message: ''});
        
            
        
    };

  render(){
    //   if(this.state.error){
    //       return <h2>Error!</h2>
    //   }
    
    return(
        <div className="app">
            <RoomList/>
            <MessageList messages={this.state.messages}/>
            <SendMessageForm sendMessage={this.sendMessage}/>
            {/* <div>{ this.state.userName}</div>
            <h2>Chat</h2>
            <from>
                <input 
                    type="text"
                    value={this.state.message}
                    onChange={e => this.setState({message: e.target.value})}/>
                    <button onClick={this.sendMessage}>SendMessage</button>
            </from>
            <div>
                {this.state.messages.map((message, index) => 
                   (<span key={index} style={{display: 'block'}}>{message}</span>)
                )}
            </div> */}

        </div>
    );
  };
};

export default withAuth(Dashboard);