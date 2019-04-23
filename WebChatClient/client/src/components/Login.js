import React, {Component} from 'react';
import axios from 'axios';

export default class Login extends Component {

    state = {
        email: '',
        password: ''
    };

    onChange = (event) => {
        event.preventDefault();
        this.setState({
            [event.target.name]: event.target.value
        });
    };

    onSubmit =(event) => {
        event.preventDefault();
        localStorage.removeItem('user-data');
        axios.post('http://localhost:5000/api/auth/login', {
            email: this.state.email,
            password: this.state.password
        }).then((result, reject) => {
            if(result.status === 200){
                localStorage.setItem('user-data', JSON.stringify(result.data))
                this.props.history.push("/dashboard");
            }
            console.log(result.status);
        }).catch(err => {
            console.log(err.response.data);
        });
        


    };

    render(){
        return(
            <div>
                <form onSubmit={this.onSubmit}>

                    <label>email</label><input type="text" name="email" onChange={this.onChange} value={this.state.email}/>
                    <label>password</label><input type="password" name="password" onChange={this.onChange} value={this.state.password}/>
                    <button type="submit">Log In</button>
                </form>
                
            </div>
        );
    };
};