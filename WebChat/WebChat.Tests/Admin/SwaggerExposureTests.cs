using System;
using System.Net;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace WebChat.Tests.Admin
{
    /// <summary>
    /// The OpenAPI document maps every endpoint, parameter and model in the API. It is a
    /// development tool, and production served it to anyone - `/swagger/v1/swagger.json` and
    /// the UI both answered 200 at https://chat.vtechsolutions.site until this was gated.
    ///
    /// <see cref="AdminApiFactory"/> boots a non-Development host ("Testing"), which is the
    /// same side of the gate a deployment is on.
    /// </summary>
    public class SwaggerExposureTests : IClassFixture<AdminApiFactory>
    {
        private readonly AdminApiFactory factory;

        public SwaggerExposureTests(AdminApiFactory factory) => this.factory = factory;

        [Theory]
        [InlineData("/swagger/v1/swagger.json")]
        [InlineData("/swagger/index.html")]
        [InlineData("/swagger")]
        public async Task Swagger_is_not_served_outside_development(string path)
        {
            var response = await this.factory.Client().GetAsync(path);

            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }

        /// <summary>
        /// The other half: without it the 404s above would pass just as well if Swagger were
        /// broken everywhere, including on the developer machines the mobile clients
        /// generate their API code against.
        /// </summary>
        [Fact]
        public async Task The_flag_turns_swagger_back_on()
        {
            using var enabled = this.factory.WithWebHostBuilder(b => b.UseSetting("Swagger:Enabled", "true"));
            var client = enabled.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });

            var response = await client.GetAsync("/swagger/v1/swagger.json");

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Contains("\"openapi\"", await response.Content.ReadAsStringAsync());
        }
    }
}
