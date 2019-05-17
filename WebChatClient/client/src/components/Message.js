import React from 'react';
// import './Message.css';
import './message-test.css';


function Message(props) {
    const classToDispay = props.username === props.curentUsername ? 'replies' : 'recived';
    
    const imageLink = `https://ui-avatars.com/api/?name=${props.username}&rounded=true&bold=true&size=128`;
    return (
            <li className={ classToDispay }>
                <img src={imageLink} alt="avatar" height="22" width="22"/>
                <p>{props.text}</p>
                <span>At | {props.time}</span>
            </li>
    )
}

export default Message