import React, { Component } from 'react';
import './edit-profile.css';
import { getDefaultImageUrl, getUserAvatar, defaultimage } from '../../services'
import Axios from 'axios';
import { withAuth } from '../hoc';

class EditProfile extends Component{
    state = {
        profile: null,
        selsectedFile: null
    }

    componentDidMount(){
        this.setState({profile: this.props.profile});
    };
    componentDidUpdate(prevProps){
        if(prevProps.profile !== this.props.profile){
            this.setState({profile: this.props.profile});
        }
    }

    handleChange = (e) => {
        const {name, value } = e.target;    
        this.setState({ profile:{[name]: value} });
    };

    fileSelectedHandler = (e) => {
        this.setState({
            selsectedFile: e.target.files[0], 

        });
    };

    fileUploadHandler = (e) => {
        const { token } = this.props.user;
        var fromData = new FormData();
        fromData.append('image', this.state.selsectedFile, this.state.selsectedFile.name);
        Axios.post('http://localhost:5000/api/avatars/upload', fromData, 
        {headers:{'Authorization': `Bearer ${token}`}})
        .then(res => {
            const { profile } = this.state;
            profile.avatarFileName = res.data;
            this.setState({profile: profile});
        });
    };

    render(){
        if(!this.state.profile){
            return (<h5>Loading</h5>);
        }
        
        const { username, avatarFileName, email } = this.state.profile;

        const imagePath = !avatarFileName ? getDefaultImageUrl(username) : getUserAvatar(avatarFileName);
        return(
            <div className="edit-profile">
                <h5>EDIT PROFILE</h5>
                <div className="edit-image">
                    <img onError={defaultimage} src={imagePath} alt="avatar" name={username}/>
                    <h6>Upload new avatar...</h6>
                </div>
                <div className="file-upload">
                    <input type="file" className="upload" onChange={this.fileSelectedHandler}/>
                    <button onClick={() => this.fileUploadHandler()}>Upload</button>
                </div>
                
                <form className="edit-profile form">
                    <div className="user-name">
                        <label htmlFor="">Username</label>
                        <input type="text" value={username} onChange={this.handleChange} formNoValidate name="username"/>
                    </div>
                    <div className="user-email">
                        <label htmlFor="">Email</label>
                        <input type="email" value={email} onChange={this.handleChange} name="email"/>
                    </div>
                </form>
                
                <button onClick={() => this.props.handleEditorClose()}>Save</button>
            </div>

            

        );
    };
};

export default withAuth(EditProfile);