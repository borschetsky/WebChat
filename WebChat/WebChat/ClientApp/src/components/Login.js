import React, {Component} from 'react';
import './login.css';
import { Link } from 'react-router-dom';
import {emailRegex, formValid} from './Register';
import { login } from '../services';


export default class Login extends Component {

    state = {
        email: null,
        password: null, 
        formErrors: {
            email: '',
            password: ''
        }
    };

    componentDidMount(){
        localStorage.removeItem('user-data');
    };

    onChange = (event) => {
        event.preventDefault();

        const { name, value } = event.target;
        let formErrors = this.state.formErrors;

        switch(name){
            case "email":
                formErrors.email = emailRegex.test(value) ? "" : "Invalid email format, please, check it!"
            break;
            case "password":
                formErrors.password = value.length < 6 ? "minimum 6 characaters required fro password" : "";
            break;
            default:
            break;
        };

        this.setState({
            [event.target.name]: event.target.value, formErrors
        });
    };

    onSubmit =(event) => {
        event.preventDefault();
        if(formValid(this.state)){
            var data = JSON.parse(localStorage.getItem('user-data'));
            if(data!= null){
                localStorage.removeItem('user-data');
            }
            const loginObj = {
                email: this.state.email,
                password: this.state.password
            };
            login(loginObj).then((result) => {
                if(result.status === 200){
                    localStorage.setItem('user-data', JSON.stringify(result.data))
                    this.props.history.push("/dashboard");
                };
            }).catch(err => {
                console.error(err);
                if(err){
                    const {data} = err.response;
                    if(data){
                        for(let key of Object.keys(data)){
                            switch(key){
                                case "email":
                                    console.log(data.email);
                                    let formErrors = {...this.state.formErrors};
                                    formErrors.email = data.email;
                                    this.setState({formErrors});
                                break;
                                case "password":
                                    let formErrors2 =  {...this.state.formErrors};
                                    console.log(data.password);
                                    formErrors2.password = data.password;
                                    this.setState({formErrors: formErrors2});
                                break;    
                                default:
                                break;
                            } 
                        }
                    }
               
                
                };
                
            });
        };
    };

    render(){
        const {formErrors} = this.state;
        return(
             <div className="login wrapper">
                <div className="login form-wrapper">
                <h1>Login</h1>
                    <form noValidate onSubmit={this.onSubmit}>
                        <div className="login email">
                            <label htmlFor="login email">Email</label>
                            <input 
                                className={formErrors.email.length > 0 ? "error" : null}
                                placeholder="Email"
                                type="email"
                                name="email"
                                noValidate 
                                onChange={ this.onChange }
                                />
                        </div>
                        {formErrors.email.length > 0 && (<span className="errorMessage">{formErrors.email}</span>)}
                        <div className="password">
                            <label htmlFor="password">Password</label>
                            <input 
                                className={formErrors.password.length > 0 ? "error" : null}
                                placeholder="Password"
                                type="password"
                                name="password"
                                noValidate 
                                onChange={ this.onChange }
                                />
                        </div>
                        {formErrors.password.length > 0 && (<span className="errorMessage">{formErrors.password}</span>)}
                        <div className="createAccount">
                            <button type="submit">Log In</button>
                            <Link to="/register"><small>Dont have an account, make it!</small></Link>
                        </div>
                    </form>
                 </div>
             </div> 
        );
    };
};