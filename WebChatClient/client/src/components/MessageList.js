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
                    &larr; Chose Opponent
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
        return (
            <div className="message-list">
                {this.props.messages.map(({username, text, time, id}, index) => {
                    var myDate = new Date(time).toLocaleTimeString('en-GB', {
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    return (
                        <Message key={id} username={username} text={text} time={myDate} curentUsername={this.props.username}/>
                    )
                })}
            </div>
        )
    }
}

export default MessageList