import React from 'react'
import ReactDOM from 'react-dom'
import Message from './Message'

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
            console.log(this.props);
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
        
        return (
            <div className="message-list">
                {this.props.messages.map(({username, text, time}, index) => {
                    return (
                        <Message key={index} username={username} text={text} time={time} />
                    )
                })}
            </div>
        )
    }
}

export default MessageList