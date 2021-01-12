#See https://aka.ms/containerfastmode to understand how Visual Studio uses this Dockerfile to build your images for faster debugging.

FROM mcr.microsoft.com/dotnet/core/aspnet:3.1-buster-slim AS base
WORKDIR /app
EXPOSE 80
EXPOSE 443

RUN curl -sL https://deb.nodesource.com/setup_14.x | bash -
RUN apt-get install -y nodejs


FROM mcr.microsoft.com/dotnet/core/sdk:3.1-buster AS build
RUN curl -sL https://deb.nodesource.com/setup_14.x |  bash -
RUN apt-get install -y nodejs

WORKDIR /src
COPY ["WebChat/WebChat.csproj", "WebChat/"]
COPY ["WebChat.AvatarWriter/WebChat.AvatarWriter.csproj", "WebChat.AvatarWriter/"]
COPY ["WebChat.Connection/WebChat.Connection.csproj", "WebChat.Connection/"]
COPY ["WebChat.Data/WebChat.Models.csproj", "WebChat.Data/"]
COPY ["WebChat.Services/WebChat.Services.csproj", "WebChat.Services/"]
COPY ["WebChat.Hub/WebChat.Hubs.csproj", "WebChat.Hub/"]
RUN dotnet restore "WebChat/WebChat.csproj"
COPY . .
WORKDIR "/src/WebChat"
RUN dotnet build "WebChat.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "WebChat.csproj" -c Release -o /app/publish

FROM base AS final
WORKDIR /src
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "WebChat.dll"]