import React from 'react'

class RoomList extends React.Component {
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
        const {users} = this.props;
        if(!users){
            return(
                <div className="rooms-list">
                <ul>
                <h4>loading...</h4>
                </ul>
            </div>
            );
        };
        
        
        const items = users.map(user => {
            return(
                <div key={user.id} onClick={() => this.props.createThread(user.id)}>
                    <li key={user.id} className="room">
                    <a>{user.username}</a>
                </li>
                </div>
            );
        });
        
        return (
            <div className="rooms-list">
                <ul>
                <h4>Avaliable Users</h4>
                    {items}
                    
                </ul>
            </div>
        )
    }
}

export default RoomList