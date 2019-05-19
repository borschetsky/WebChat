import React from 'react'
import ReactDOM from 'react-dom'
import Message from '../message';
import OponentProfile from '../oponent-profile';
import { getDateInfoForMessage } from '../../helpers/';//Formating DateTime Today, Yesterday, Up to 6 days ago, Week Ago and if more showing date
import './message-list.css';
import { withAuth } from '../hoc';
import { getMessages } from '../../services';

class MessageList extends React.Component {
 
    state ={
        threadId: null,
        userProfile: null, 
        oponentProfile: null,
        messages:[]
    };

    componentDidMount(){
        this.props.connection.on('ReciveMessage', message => {
            if(message.threadId !== this.state.threadId){
                return;
            };
            let { messages } = this.state;
            messages = [...messages, message];
            this.setState({messages});
        });
        this.setState({
            threadId: this.props.threadId, 
            userProfile: this.props.userProfile,
            oponentProfile: this.props.oponentProfile
        });
    }

    componentWillUpdate() {
        const node = ReactDOM.findDOMNode(this)
        this.shouldScrollToBottom = node.scrollTop + node.clientHeight + 100 >= node.scrollHeight
    }
    
    componentDidUpdate(prevProps) {
        if (this.shouldScrollToBottom) {
            const node = ReactDOM.findDOMNode(this)
            node.scrollTop = node.scrollHeight   
        }
        if(prevProps.threadId !== this.props.threadId){
           
            this.setState({
                threadId: this.props.threadId,
            });
            this.getMessagesForThread(this.props.threadId);
        }
        if(prevProps.oponentProfile !== this.props.oponentProfile){
            this.setState({oponentProfile: this.props.oponentProfile})
        }
    }

    getMessagesForThread = (threadId) => {
        const {token} = this.props.user;
            this.setState({messages: []});
            getMessages(threadId, token).then(res => {
                this.setState({messages: res.data});
            }).catch(err => console.log(err));
    };

    render() {
        const { messages, oponentProfile, threadId } = this.state;
        const chooseOpponent = (<div className="join-room">&larr; Chose Opponent</div>);
        const noMessages = (<div className="join-room">You Still have no messages - begin chatting</div>);
        const messagesMap =  messages.map(({ username, text, time, id }, index) => {
            var myDate = getDateInfoForMessage(time);
            return (
                <Message key={id} username={username} text={text} time={myDate} curentUsername={this.props.username} />
            )
        });
        const content = messages.length < 1 ? noMessages : messagesMap;
        const contentToDisplay = !threadId ? chooseOpponent : content;
        // if (!this.state.threadId) {
            
        //     return (
        //         <div className="message-list">
        //             <div className="join-room">
        //             &larr; Chose Opponent
        //             </div>
        //         </div>
        //     )
        // }
        // if(messages.length < 1){
        //     return(
        //         <div className="message-list">
        //             <div className="join-room">
        //                 You Still have no messages - begin chatting
        //             </div>
        //         </div>
        //     );
        // }
        
        return (
            <React.Fragment>
                <OponentProfile profile={oponentProfile} />
                <div className="message-list">
                    {/* {messages.map(({ username, text, time, id }, index) => {
                        var myDate = getDateInfoForMessage(time);
                        return (
                            <Message key={id} username={username} text={text} time={myDate} curentUsername={this.props.username} />
                        )
                    })} */}
                    {contentToDisplay}
                </div>
            </React.Fragment>

        )
    }
}

export default withAuth(MessageList);