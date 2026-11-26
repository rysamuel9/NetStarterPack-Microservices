FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY src/BuildingBlocks/BuildingBlocks.Core/BuildingBlocks.Core.csproj src/BuildingBlocks/BuildingBlocks.Core/
COPY src/BuildingBlocks/BuildingBlocks.Security/BuildingBlocks.Security.csproj src/BuildingBlocks/BuildingBlocks.Security/
COPY src/BuildingBlocks/BuildingBlocks.Infrastructure/BuildingBlocks.Infrastructure.csproj src/BuildingBlocks/BuildingBlocks.Infrastructure/
COPY src/Services/Tracking/Tracking.Api/Tracking.Api.csproj src/Services/Tracking/Tracking.Api/

RUN dotnet restore src/Services/Tracking/Tracking.Api/Tracking.Api.csproj

COPY src/BuildingBlocks/ src/BuildingBlocks/
COPY src/Services/Tracking/ src/Services/Tracking/

RUN dotnet publish src/Services/Tracking/Tracking.Api/Tracking.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
EXPOSE 5087
ENV ASPNETCORE_URLS=http://+:5087
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Tracking.Api.dll"]
