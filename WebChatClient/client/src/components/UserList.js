import React from 'react'
import './userlist.css';


class UserList extends React.Component {
    state = {
        users: null,
        treads: null,
        loading: true
    };
    render () {
        // const orderedRooms = [...this.props.rooms].sort((a, b) => a.id > b.id);
        // const items = orderedRooms.map(room => {
        //     const active = room.id === this.props.roomId ? 'active' : '';
        //     return (
        //         <li key={room.id} className={"room " + active}>
        //             <a
        //                 onClick={() => this.props.subscribeToRoom(room.id)}
        //                 href="#">
        //                 # {room.name}
        //             </a>
        //         </li>
        //     )
        // });
        // const itemsToDisplay = items ? items : null;
        const {threads} = this.props;
        if(!threads){
            return(
                <div className="user-list">
                <ul>
                <h4>You have no threads</h4>
                </ul>
            </div>
            );
        };
        
        console.log(threads);
        const items = threads.map(thread => {
            let userNameToDisplay = '';
            
            if (thread.owner === this.props.userId){
                userNameToDisplay = thread.oponentName;  
            }
            if(thread.oponent === this.props.userId){
                userNameToDisplay = thread.ownerName;
            };
            const imageLink = `https://ui-avatars.com/api/?name=${userNameToDisplay}&rounded=true&bold=true&size=128`;
            const active = thread.id === this.props.threadId ? 'active' : '';
            return(
                <li key={thread.id} className={"clearfix " + active}>
                    <div className="clearfix-wrapper" onClick={() => this.props.subscribeToThread(thread.id)}>
                        <img src={imageLink} alt="avatar"/>
                        <div className="about">
                            <div className="name">{userNameToDisplay}</div>
                            <div className="status">
                                <i className="fa fa-circle online"></i> online
                            </div>
                        </div>
                    </div>
                    
                 </li>
                 );
            
        });
        
        return (
            <div className="people-list">
            <div className="search">
                <input type="text" className="search-bar" placeholder="Search"/>
            </div>
                <ul className="list">
                    {items}
                    
                </ul>
            </div>
        )
    }
}

export default UserList;