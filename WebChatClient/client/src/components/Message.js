import React from 'react'

function Message(props) {  
    console.log(props);
    return (
        <div className="message">
            <div className="message-username">{props.username}</div>
            <div className="message-text">{props.text}</div>
            <div className="message">{props.time}</div>
        </div>
    )
}

export default Message