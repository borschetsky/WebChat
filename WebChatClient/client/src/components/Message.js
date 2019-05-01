import React from 'react';
import './Message.css';
function Message(props) {  
    const imageLink = `https://ui-avatars.com/api/?name=${props.username}&rounded=true&bold=true&size=128`;
    return (
        // <div className="message">
        //     <div>
        //         <img src={imageLink} height="42" width="42"/>
        //         <div className="message-username">{props.username} | At {props.time}</div>
        //         <div className="message-text">{props.text}</div>
        //     </div>
            
        // </div>
        <div className="incoming_msg">
            <div className="incoming_msg_img">
                <img src={imageLink} alt="avatar" height="20" width="20"/>
            </div>
            <div className="recived_msg">
                <div className="user-name">{props.username}</div>
                <div className="received_withd_msg">
                    <p>{props.text}</p>
                    <span className="time_date">At | {props.time}</span>
                </div>
            </div>
        </div>
    )
}

export default Message