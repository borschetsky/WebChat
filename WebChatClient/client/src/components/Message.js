import React from 'react';
// import './Message.css';
import './message-test.css';


function Message(props) {
    const nameToDisplay = ((props.username === props.curentUsername) ? "You" : props.username);
    const classToDispay = props.username === props.curentUsername ? 'replies' : 'recived';

    const imageLink = `https://ui-avatars.com/api/?name=${props.username}&rounded=true&bold=true&size=128`;
    return (
        // <div className="incoming_msg">
        //     <div className="incoming_msg_img">
        //         <img src={imageLink} alt="avatar" height="20" width="20"/>
        //     </div>
        //     <div className="recived_msg">
        //         <div className="user-name">{nameToDisplay}</div>
        //         <div className="received_withd_msg">
        //             <p>{props.text}</p>
        //             <span className="time_date">At | {props.time}</span>
        //         </div>
        //     </div>
        // </div>
            <li className={ classToDispay }>
                <img src={imageLink} alt="avatar" height="22" width="22"/>
                <p>{props.text}</p>
                <span>At | {props.time}</span>
            </li>
    )
}

export default Message