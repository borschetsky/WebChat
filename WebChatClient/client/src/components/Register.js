import React, { Component } from 'react';
import './register.css';
import Axios from 'axios';

export default class Register extends Component {

    state = {
        username: '',
        email: '',
        password: ''
    };


    onChange = (event) => {
        event.preventDefault();
        this.setState({
            [event.target.name]: event.target.value
        });
    };

    onSubmit = (event) => {
        event.preventDefault();
        
        Axios.post('http://localhost:5000/api/auth/register', {
            username: this.state.username,
            email: this.state.email,
            password: this.state.password
        }).then(result => console.log(result.data));
    };

    render(){
        return(
            <div className="register">
                <form onSubmit={this.onSubmit}>
                    <div className="form-group"> 
                         <label htmlFor="exampleInputEmail1">Email address</label>
                         <input type="email" name="email" className="form-control" id="exampleInputEmail1" aria-describedby="emailHelp" placeholder="Enter email" onChange={this.onChange}/>
                    </div>
                    <div className="form-group"> 
                         <label htmlFor="exampleInputEmail1">Username</label>
                         <input type="text" name="username" className="form-control" id="exampleInputEmail1" aria-describedby="emailHelp" placeholder="Enter Username" onChange={this.onChange}/>
                    </div>
                    <div className="form-group">
                        <label htmlFor="exampleInputPassword1">Password</label>
                        <input type="password" name="password" className="form-control" id="exampleInputPassword1" placeholder="Password" onChange={this.onChange}/>
                    </div>
                    <button type="submit" className="btn btn-primary">Submit</button>
                </form>

            </div>

        );
    };

};