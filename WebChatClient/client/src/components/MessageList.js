import React from 'react'
import ReactDOM from 'react-dom'
import Message from './Message'
import './message-list.css';
class MessageList extends React.Component {
    
    componentWillUpdate() {
        const node = ReactDOM.findDOMNode(this)
        this.shouldScrollToBottom = node.scrollTop + node.clientHeight + 100 >= node.scrollHeight
    }
    
    componentDidUpdate() {
        if (this.shouldScrollToBottom) {
            const node = ReactDOM.findDOMNode(this)
            node.scrollTop = node.scrollHeight   
        }
    }
    
    render() {
        if (!this.props.threadId) {
            
            return (
                <div className="message-list">
                    <div className="join-room">
                        Chose Oponent &rarr;
                    </div>
                </div>
            )
        }
        if(this.props.messages.length < 1){
            return(
                <div className="message-list">
                    <div className="join-room">
                        You Still have no messages - begin chatting
                    </div>
                </div>
            );
        }
        console.log(this.props.messages);
        return (
            <div className="message-list">
                {this.props.messages.map(({username, text, time, id}, index) => {
                    return (
                        <Message key={id} username={username} text={text} time={time} curentUsername={this.props.username}/>
                    )
                })}
            </div>
        )
    }
}

export default MessageList