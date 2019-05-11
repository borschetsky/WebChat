import React from 'react'
import './userlist.css';
import Search from './Search';
import './found-users/found-users.css';
import Axios from 'axios';
import UserSearch from './user-search';
import UserThreads from './user-threads';
import EditProfile from './edit-profile';
import { withAuth } from './hoc/';

class UserList extends React.Component {
    state = {
        users: [],
        threadId: '',
        threads: [],
        loading: true,
        search: '',
        isEdit: false,
        profile: null
        
    };

    componentDidMount(){
        console.log(this.props.profile);
        this.setState({
            threads: this.props.threads,
            threadId: this.props.threadId,
            isEdit: this.props.isEdit,
            profile: this.props.profile
        });
    }
    componentDidUpdate(prevProps){
        if(prevProps.threads !== this.props.threads ){
            this.setState({threads: this.props.threads});
        }
        if(prevProps.threadId !== this.props.threadId){
            this.setState({threadId: this.props.threadId});
        }
        if(prevProps.isEdit !== this.props.isEdit){
            this.setState({isEdit: this.props.isEdit})
        }
        if(prevProps.profile !== this.props.profile){
            this.setState({profile: this.props.profile}, console.log(this.state.profile))
        }
       
    }
    handleSearch = (e) => {
        const { token } = this.props.user;
        const { value } = e.target;
        Axios.get(`http://localhost:5000/api/users/search?name=${value}`, 
            {headers: {'Authorization': `Bearer ${token}`}}
            ).then(res => {this.setState({users: res.data}); console.log(res.data)});
        this.setState({search: value});
    };
    clearSearch = () =>{
        this.setState({search: ''});
    };
    
    
    render () {
        const { threads, threadId} = this.state;
        const { userId, subscribeToThread } = this.props; 
        let itemsToDisplay = this.state.search.length > 0 ? 
        <UserSearch users={this.state.users} createThread={this.props.createThread} clearSearch={this.clearSearch}/>
        : <UserThreads threads={threads} userId={userId} subscribeToThread={subscribeToThread} threadId={threadId}/>;
        if(this.state.isEdit){
            return(
                <div className="people-list">
                    <EditProfile handleEditorClose={this.props.handleEditorClose} profile={this.state.profile}/>
                </div>
            );
        }
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

export default withAuth(UserList);