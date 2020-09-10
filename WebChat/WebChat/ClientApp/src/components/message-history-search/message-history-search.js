import React from 'react';
import './message-history-search.css';
import { getDefaultImageUrl, getUserAvatar, defaultimage} from '../../services';

class MessageHistorySearch extends React.Component {
    state ={
        term: ''
    };

    onTermChange = (e) =>{
        const { onSearchChange } = this.props;
        this.setState({term: e.target.value});
        onSearchChange(e.target.value);
    };

    render(){
        const { profile, handleSearchbar } = this.props;
        const { term } = this.state;
        const imagePath = profile.avatarFileName === null ? getDefaultImageUrl(profile.username) : getUserAvatar(profile.avatarFileName);
        return(
            <div className="history-search">
                <img onError={defaultimage} src={imagePath} alt="avatar" name={profile.username}/>
                <i className="material-icons md-32">search</i>
                <div className="search">
                    <input type="search" 
                           placeholder="Seach at messaging history" 
                           autoFocus
                           value={term}
                           onChange={this.onTermChange}/>
                </div>
                <button className="cancel-button" onClick={handleSearchbar}>Cancel</button>
            </div>
            );
    };
   
};

export default MessageHistorySearch;