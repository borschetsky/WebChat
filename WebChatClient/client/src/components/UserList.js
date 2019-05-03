import React from 'react'
import './userlist.css';
import Search from './Search';

class UserList extends React.Component {
    state = {
        users: null,
        treads: [],
        loading: true,
        search: ''
    };

    handleSearch = (e) => {
        const { value } = e.target;
        this.setState({search: value});
    };

    searchItems = (items, search) => {
        if(search.length === 0){
            return items;
        };
        return items.filter(item => {
            return item.username.toLowerCase().indexOf(search.toLowerCase()) > -1;
        });
    };
    render () {
        const {threads} = this.props;
        // if(!threads){
        //     return(
        //         <div className="user-list">
        //         <ul>
        //         <h4>You have no threads</h4>
        //         </ul>
        //     </div>
        //     );
        // };
        
        
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
                <li key={thread.id} className={"clearfix " + active} onClick={() => this.props.subscribeToThread(thread.id, userNameToDisplay)}>
                    <div className="clearfix-wrapper" >
                        <img src={imageLink} alt="avatar"/>
                        <div className="about">
                            <div className="name">{userNameToDisplay}</div>
                            <div className="status">
                                {/* <i className="fa fa-circle online"></i> online */}
                                Last message
                            </div>
                        </div>
                    </div>
                 </li>
                 );
            
        });
        const filteredItems = this.searchItems(this.props.users, this.state.search);
        //TODO: extract to a separate components
        const users = filteredItems.map( u => {
            const { createThread } = this.props;
            return(
                <li key={u.id} onClick={() => {createThread(u.id, u.username); this.setState({search: ''});}}>
                    {u.username}
                </li>
            );
        });

        let itemsToDisplay = this.state.search.length > 0 ? users : items;
        
        
        return (
            <div className="people-list">
            <Search handleSearch={this.handleSearch} value={this.state.search}/>
                <ul className="list">
                    {itemsToDisplay}
                </ul>
            </div>
        )
    }
}

export default UserList;